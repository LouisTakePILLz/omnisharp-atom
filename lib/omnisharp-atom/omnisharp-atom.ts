import * as _ from "lodash";
import {CompositeDisposable, Disposable, IDisposable} from "../Disposable";
import {Observable, Subject} from "@reactivex/rxjs";
import * as path from "path";
import * as fs from "fs";
import {fromNodeCallback} from "../fromCallback";
import {OmniSharpAtom as OmniAtom} from "../omnisharp.ts";

// TODO: Remove these at some point to stream line startup.
import {Omni} from "../omni-sharp-server/omni";
const win32 = process.platform === "win32";

class OmniSharpAtom {
    private disposable: CompositeDisposable;
    // Internal: Used by unit testing to make sure the plugin is completely activated.
    private _started: Subject<boolean>;
    private _activated: Subject<boolean>;

    public activate(state: any) {
        this.disposable = new CompositeDisposable;
        this._started = new Subject<boolean>();
        this._activated = new Subject<boolean>();

        this.configureKeybindings();

        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:toggle", () => this.toggle()));
        this.disposable.add(atom.commands.add("atom-workspace", "omnisharp-atom:settings", () => atom.workspace.open("atom://config/packages")
            .then(tab => {
                if (tab && tab.getURI && tab.getURI() !== "atom://config/packages/omnisharp-atom") {
                    atom.workspace.open("atom://config/packages/omnisharp-atom");
                }
            })));

        require("atom-package-deps").install("omnisharp-atom")
            .then(() => {
                console.info("Activating omnisharp-atom solution tracking...");
                Omni.activate();
                this.disposable.add(Omni);

                this._started.next(true);
                this._started.complete();
            })
            .then(() => this.loadFeatures(this.getFeatures("atom").delay(2000)).toPromise())
            .then(() => {
                let startingObservable = Omni.activeSolution
                    .filter(z => !!z)
                    .take(1);

                /* tslint:disable:no-string-literal */
                if (Omni["_kick_in_the_pants_"]) {
                    startingObservable = Observable.of(null);
                }
                /* tslint:enable:no-string-literal */

                // Only activate features once we have a solution!
                this.disposable.add(startingObservable
                    .mergeMap(() => this.loadFeatures(this.getFeatures("features")))
                    .subscribe(null, null, () => {
                        this.disposable.add(atom.workspace.observeTextEditors((editor: Atom.TextEditor) => {
                            this.detectAutoToggleGrammar(editor);
                        }));

                        this._activated.next(true);
                        this._activated.complete();
                    }));

            });
    }

    public getFeatures(folder: string) {
        const whiteList = atom.config.get<boolean>("omnisharp-atom:feature-white-list");
        const featureList = atom.config.get<string[]>("omnisharp-atom:feature-list");
        const whiteListUndefined = (typeof whiteList === "undefined");

        console.info(`Getting features for "${folder}"...`);

        const packageDir = Omni.packageDir;
        const featureDir = `${packageDir}/omnisharp-atom/lib/omnisharp-atom/${folder}`;

        function loadFeature(file: string) {
            const result = require(`./${folder}/${file}`);
            console.info(`Loading feature "${folder}/${file}"...`);
            return result; //_.values(result).filter(feature => !_.isFunction(feature));
        }

        return fromNodeCallback<string[], string>(fs.readdir)(featureDir)
            .mergeMap(files => Observable.from(files))
            .filter(file => /\.js$/.test(file))
            .mergeMap(file => fromNodeCallback<fs.Stats, string>(fs.stat)(`${featureDir}/${file}`).map(stat => ({ file, stat })))
            .filter(z => !z.stat.isDirectory())
            .map(z => ({
                file: `${folder}/${path.basename(z.file)}`.replace(/\.js$/, ""),
                load: () => {
                    const feature = loadFeature(z.file);

                    const features: { key: string, activate: () => () => void }[] = [];
                    _.each(feature, (value: OmniAtom.IFeature, key: string) => {
                        if (!_.isFunction(value)) {
                            if (!value.required) {
                                this.config[key] = {
                                    title: `${value.title}`,
                                    description: value.description,
                                    type: "boolean",
                                    default: (_.has(value, "default") ? value.default : true)
                                };
                            }

                            features.push({
                                key, activate: () => {
                                    return this.activateFeature(whiteListUndefined, key, value);
                                }
                            });
                        }
                    });

                    return Observable.from<{ key: string, activate: () => () => void }>(features);
                }
            }))
            .filter(l => {
                if (typeof whiteList === "undefined") {
                    return true;
                }

                if (whiteList) {
                    return _.contains(featureList, l.file);
                } else {
                    return !_.contains(featureList, l.file);
                }
            });
    }

    public loadFeatures(features: Observable<{ file: string; load: () => Observable<{ key: string, activate: () => () => void }> }>) {
        return features
            .concatMap(z => z.load())
            .toArray()
            .concatMap(x => x)
            .map(f => f.activate())
            .filter(x => !!x)
            .toArray()
            .do(null, null, () => {
                (<any>atom.config).setSchema("omnisharp-atom", {
                    type: "object",
                    properties: this.config
                });
            })
            .concatMap(x => x)
            .do(x => x());
    }

    public activateFeature(whiteListUndefined: any, key: string, value: OmniAtom.IFeature) {
        let result: () => void = null;
        let firstRun = true;

        // Whitelist is used for unit testing, we don"t want the config to make changes here
        if (whiteListUndefined && _.has(this.config, key)) {
            const configKey = `omnisharp-atom.${key}`;
            let enableDisposable: IDisposable, disableDisposable: IDisposable;
            this.disposable.add(atom.config.observe(configKey, enabled => {
                if (!enabled) {
                    if (disableDisposable) {
                        disableDisposable.dispose();
                        this.disposable.remove(disableDisposable);
                        disableDisposable = null;
                    }

                    try { value.dispose(); } catch (ex) { /* */ }

                    enableDisposable = atom.commands.add("atom-workspace", `omnisharp-feature:enable-${_.kebabCase(key)}`, () => atom.config.set(configKey, true));
                    this.disposable.add(enableDisposable);
                } else {
                    if (enableDisposable) {
                        enableDisposable.dispose();
                        this.disposable.remove(disableDisposable);
                        enableDisposable = null;
                    }

                    console.info(`Activating feature "${key}"...`);
                    value.activate();

                    /* tslint:disable:no-string-literal */
                    if (_.isFunction(value["attach"])) {
                        if (firstRun) {
                            result = () => {
                                console.info(`Attaching feature "${key}"...`);
                                value["attach"]();
                            };
                        } else {
                            console.info(`Attaching feature "${key}"...`);
                            value["attach"]();
                        }
                    }
                    /* tslint:enable:no-string-literal */

                    disableDisposable = atom.commands.add("atom-workspace", `omnisharp-feature:disable-${_.kebabCase(key)}`, () => atom.config.set(configKey, false));
                    this.disposable.add(disableDisposable);
                }
                firstRun = false;
            }));

            this.disposable.add(atom.commands.add("atom-workspace", `omnisharp-feature:toggle-${_.kebabCase(key)}`, () => atom.config.set(configKey, !atom.config.get(configKey))));
        } else {
            value.activate();

            /* tslint:disable:no-string-literal */
            if (_.isFunction(value["attach"])) {
                result = () => {
                    console.info(`Attaching feature "${key}"...`);
                    value["attach"]();
                };
            }
            /* tslint:enable:no-string-literal */
        }

        this.disposable.add(Disposable.create(() => { try { value.dispose(); } catch (ex) { /* */ } }));
        return result;
    }

    private detectAutoToggleGrammar(editor: Atom.TextEditor) {
        const grammar = editor.getGrammar();
        this.detectGrammar(editor, grammar);
        this.disposable.add(editor.onDidChangeGrammar((gmmr: FirstMate.Grammar) => this.detectGrammar(editor, gmmr)));
    }

    private detectGrammar(editor: Atom.TextEditor, grammar: FirstMate.Grammar) {
        if (!atom.config.get("omnisharp-atom.autoStartOnCompatibleFile")) {
            return; //short out, if setting to not auto start is enabled
        }

        if (Omni.isValidGrammar(grammar)) {
            if (Omni.isOff) {
                this.toggle();
            }
        } else if (grammar.name === "JSON") {
            if (path.basename(editor.getPath()) === "project.json") {
                if (Omni.isOff) {
                    this.toggle();
                }
            }
        }
    }

    public toggle() {
        if (Omni.isOff) {
            Omni.connect();
        } else if (Omni.isOn) {
            Omni.disconnect();
        }
    }

    public deactivate() {
        this.disposable.dispose();
    }

    public consumeStatusBar(statusBar: any) {
        let f = require("./atom/status-bar");
        f.statusBar.setup(statusBar);
        f = require("./atom/framework-selector");
        f.frameworkSelector.setup(statusBar);
        f = require("./atom/feature-buttons");
        f.featureEditorButtons.setup(statusBar);
    }

    public consumeYeomanEnvironment(generatorService: any) {
        const {generatorAspnet} = require("./atom/generator-aspnet");
        generatorAspnet.setup(generatorService);
    }

    /* tslint:disable:variable-name */
    public provideAutocomplete() {
        const {CompletionProvider} = require("./services/completion-provider");
        this.disposable.add(CompletionProvider);
        return CompletionProvider;
    }

    public provideLinter() {
        const LinterProvider = require("./services/linter-provider");
        return LinterProvider.provider;
    }

    public provideProjectJson() {
        return require("./services/project-provider").concat(require("./services/framework-provider"));
    }

    public consumeLinter(linter: any) {
        const LinterProvider = require("./services/linter-provider");
        const linters = LinterProvider;

        this.disposable.add(Disposable.create(() => {
            _.each(linters, l => {
                linter.deleteLinter(l);
            });
        }));

        this.disposable.add(LinterProvider.init());
    }
    /* tslint:enable:variable-name */

    private configureKeybindings() {
        const omnisharpFileNew = Omni.packageDir + "/omnisharp-atom/keymaps/omnisharp-file-new.cson";
        this.disposable.add(atom.config.observe("omnisharp-atom.enableAdvancedFileNew", (enabled) => {
            if (enabled) {
                atom.keymaps.loadKeymap(omnisharpFileNew);
            } else {
                atom.keymaps.removeBindingsFromSource(omnisharpFileNew);
            }
        }));

        let disposable: Disposable;
        const omnisharpAdvancedFileNew = Omni.packageDir + "/omnisharp-atom/keymaps/omnisharp-advanced-file-new.cson";
        this.disposable.add(atom.config.observe("omnisharp-atom.useAdvancedFileNew", (enabled) => {
            if (enabled) {
                atom.keymaps.loadKeymap(omnisharpAdvancedFileNew);

                const anymenu = <any>atom.menu;
                _.each(anymenu.template, (template: any) => {
                    const item = <any>_.find(template.submenu, { command: "application:new-file" });
                    if (item) {
                        item.command = "advanced-open-file:toggle";
                    }
                });
            } else {
                if (disposable) disposable.dispose();
                atom.keymaps.removeBindingsFromSource(omnisharpAdvancedFileNew);

                const anymenu = <any>atom.menu;
                _.each(anymenu.template, (template: any) => {
                    const item = <any>_.find(template.submenu, { command: "advanced-open-file:toggle" });
                    if (item) {
                        item.command = "application:new-file";
                    }
                });
            }
        }));
    }

    public config = {
        autoStartOnCompatibleFile: {
            title: "Autostart Omnisharp Roslyn",
            description: "Automatically starts Omnisharp Roslyn when a compatible file is opened.",
            type: "boolean",
            default: true
        },
        developerMode: {
            title: "Developer Mode",
            description: "Outputs detailed server calls in console.log",
            type: "boolean",
            default: false
        },
        showDiagnosticsForAllSolutions: {
            title: "Show Diagnostics for all Solutions",
            description: "Advanced: This will show diagnostics for all open solutions.  NOTE: May take a restart or change to each server to take effect when turned on.",
            type: "boolean",
            default: false
        },
        enableAdvancedFileNew: {
            title: "Enable `Advanced File New`",
            description: "Enable `Advanced File New` when doing ctrl-n/cmd-n within a C# editor.",
            type: "boolean",
            default: true
        },
        useAdvancedFileNew: {
            title: "Use `Advanced File New` as default",
            description: "Use `Advanced File New` as your default new command everywhere.",
            type: "boolean",
            default: false
        },
        useLeftLabelColumnForSuggestions: {
            title: "Use Left-Label column in Suggestions",
            description: "Shows return types in a right-aligned column to the left of the completion suggestion text.",
            type: "boolean",
            default: false
        },
        useIcons: {
            title: "Use unique icons for kind indicators in Suggestions",
            description: "Shows kinds with unique icons rather than autocomplete default styles.",
            type: "boolean",
            default: true
        },
        autoAdjustTreeView: {
            title: "Adjust the tree view to match the solution root.",
            descrption: "This will automatically adjust the treeview to be the root of the solution.",
            type: "boolean",
            default: false
        },
        nagAdjustTreeView: {
            title: "Show the notifications to Adjust the tree view",
            type: "boolean",
            default: true
        },
        autoAddExternalProjects: {
            title: "Add external projects to the tree view.",
            descrption: "This will automatically add external sources to the tree view.\n External sources are any projects that are loaded outside of the solution root.",
            type: "boolean",
            default: false
        },
        nagAddExternalProjects: {
            title: "Show the notifications to add or remove external projects",
            type: "boolean",
            default: true
        },
        hideLinterInterface: {
            title: "Hide the linter interface when using omnisharp-atom editors",
            type: "boolean",
            default: true
        },
        wantMetadata: {
            title: "Want metadata",
            descrption: "Request symbol metadata from the server, when using go-to-definition.  This is disabled by default on Linux, due to issues with Roslyn on Mono.",
            type: "boolean",
            default: win32
        }
    };
}

module.exports = new OmniSharpAtom;
