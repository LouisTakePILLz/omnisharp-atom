import * as _ from "lodash";
import {Observable} from "@reactivex/rxjs";
import {Omni} from "../../omni-sharp-server/omni";
import {SolutionManager} from "../../omni-sharp-server/solution-manager";
import {ajax} from "jquery";
const filter = require("fuzzaldrin").filter;

const cache = new Map<string, { prefix?: string; results: string[] }>();
const versionCache = new Map<string, any>();
Omni.listener.packagesource
    .map(z => z.response.Sources)
    .subscribe((sources: string[]) => {
        _.each(sources, source => {
            if (!cache.get(source))
                fetchFromGithub(source, "_keys", "").subscribe(result => {
                    cache.set(source, result);
                });
        });
    });

function fetchFromGithub(source: string, prefix: string, searchPrefix: string): Observable<{ prefix?: string; results: string[] }> {
    // We precache the keys to make this speedy
    if (prefix === "_keys" && cache.has(source)) {
        return Observable.of(cache.get(source));
    }

    // If we have a value in the cache, see if the key exists or not.
    if (cache.has(source)) {
        const c = cache.get(source);
        if (!c) {
            return Observable.of(c);
        }

        if (!_.any(c.results, x => x.toLowerCase() === prefix.toLowerCase() + ".")) {
            return Observable.of({ results: [] });
        }
    }

    // If we have a cached value then the failed value is empty (no need to fall back to the server)
    const failedValue: { prefix?: string; results: string[] } = cache.has(source) && !!cache.get(source) ? { prefix: null, results: [] } : { prefix: null, results: null };

    const realSource = source;

    // This is the same convention used by omnisharp-nuget build tool
    source = _.trim(source, "/").replace("www.", "").replace("https://", "").replace("http://", "").replace(/\/|\:/g, "-");

    // Get the file from github
    let result = ajax(`https://raw.githubusercontent.com/OmniSharp/omnisharp-nuget/resources/resources/${source}/${prefix.toLowerCase()}.json`).then(res => JSON.parse(res), () => { /* */ });

    // The non key files have an object layout
    if (prefix !== "_keys") {
        const sp = searchPrefix.split(".");
        const filePrefix = sp.slice(1, sp.length - 1).join(".").toLowerCase();
        result = result.then((value: { _keys: string[]; [key: string]: string[] }) => {
            const k = _.find(cache.get(realSource).results, x => x.toLowerCase() === prefix.toLowerCase());
            if (!filePrefix) {
                return { prefix: k, results: value._keys };
            } else {
                const v = (<any>_).findKey(value, (x: any, key: string) => key.toLowerCase() === filePrefix),
                    p = `${k}.${v}`;

                return { prefix: k && v && p, results: value[v] || [] };
            }
        });
    } else {
        result = result.then((results) => ({ prefix: "", results }));
    }

    // Return the result
    return Observable.fromPromise<{ prefix: string; results: string[] }>(<any>result).catch(() => Observable.of(failedValue));
}

interface IAutocompleteProviderOptions {
    editor: Atom.TextEditor;
    bufferPosition: TextBuffer.Point; // the position of the cursor
    prefix: string;
    scopeDescriptor: { scopes: string[] };
    activatedManually: boolean;
    path: string;
    replacementPrefix: string;
}

interface IAutocompleteProvider {
    fileMatchs: string[];
    pathMatch: (path: string) => boolean;
    getSuggestions: (options: IAutocompleteProviderOptions) => Promise<any[]>;
    dispose(): void;
}

function makeSuggestion(item: string, path: string, replacementPrefix: string) {
    const type = "package";

    const r = replacementPrefix.split(".");
    let rs = r.slice(0, r.length - 1).join(".");
    if (rs.length) rs += ".";
    if (path.length) path += ".";

    return {
        _search: item,
        text: `${path}${item}`,
        snippet: `${path}${item}`,
        type: type,
        displayText: item,
        replacementPrefix, //: `${rs}${item}`,
        className: "autocomplete-project-json",
    };
}

function makeSuggestion2(item: string, replacementPrefix: string) {
    const type = "version";

    return {
        _search: item,
        text: item,
        snippet: item,
        type: type,
        displayText: item,
        replacementPrefix,
        className: "autocomplete-project-json",
    };
}

const nameRegex = /\/?dependencies$/;
const versionRegex = /\/?dependencies\/([a-zA-Z0-9\._]*?)(?:\/version)?$/;

class NugetNameProvider implements IAutocompleteProvider {
    public getSuggestions(options: IAutocompleteProviderOptions) {

        const searchTokens = options.replacementPrefix.split(".");
        let packagePrefix: string;
        if (options.replacementPrefix.indexOf(".") > -1) {
            packagePrefix = options.replacementPrefix.split(".")[0];
        }

        return SolutionManager.getSolutionForEditor(options.editor)
            // Get all sources
            .mergeMap(z => Observable.from(z.model.packageSources))
            .mergeMap(source => {
                // Attempt to get the source from github
                return fetchFromGithub(source, packagePrefix || "_keys", options.replacementPrefix)
                    .mergeMap(z => {
                        if (!z) {
                            // fall back to the server if source isn"t found
                            console.info(`Falling back to server package search for ${source}.`);
                            return Omni.request(solution => solution.packagesearch({
                                Search: options.replacementPrefix,
                                IncludePrerelease: true,
                                ProjectPath: solution.path,
                                Sources: [source],
                            })).map(x => ({ prefix: "", results: x.Packages.map(item => item.Id) }));
                        } else {
                            return Observable.of(z);
                        }
                    });
            })
            .toArray()
            .map(z => {
                const prefix = _.find(z, x => !!x.prefix);
                const p = prefix ? prefix.prefix : "";
                return _(z.map(x => x.results))
                    .flatten<string>()
                    .sortBy()
                    .unique()
                    .map(x =>
                        makeSuggestion(x, p, options.replacementPrefix))
                    .value();
            })
            .map(s =>
                filter(s, searchTokens[searchTokens.length - 1], { key: "_search" }))
            .toPromise();
    }
    public fileMatchs = ["project.json"];
    public pathMatch(path: string) {
        return path && !!path.match(nameRegex);
    }
    public dispose() { /* */ }
}

class NugetVersionProvider implements IAutocompleteProvider {
    public getSuggestions(options: IAutocompleteProviderOptions) {
        const match = options.path.match(versionRegex);
        if (!match) return Promise.resolve([]);
        const name = match[1];

        let o: Observable<string[]>;

        if (versionCache.has(name)) {
            o = versionCache.get(name);
        } else {
            o = SolutionManager.getSolutionForEditor(options.editor)
                // Get all sources
                .mergeMap(z => Observable.from(z.model.packageSources))
                .filter(z => {
                    if (cache.has(z)) {
                        // Short out early if the source doesn"t even have the given prefix
                        return _.any(cache.get(z).results, x => _.startsWith(name, x));
                    }
                    return true;
                })
                .toArray()
                .mergeMap(sources => Omni.request(solution => solution.packageversion({
                    Id: name,
                    IncludePrerelease: true,
                    ProjectPath: solution.path,
                    Sources: sources,
                }))
                    .mergeMap(z => Observable.from(z.Versions))
                    .toArray())
                .publishReplay(1)
                .refCount();

            versionCache.set(name, o);
        }

        return o.take(1)
            .map(z => z.map(x =>
                makeSuggestion2(x, options.replacementPrefix)))
            .map(s =>
                filter(s, options.prefix, { key: "_search" }))
            .toPromise();
    }
    public fileMatchs = ["project.json"];
    public pathMatch(path: string) {
        return path && !!path.match(versionRegex);
    }
    public dispose() { /* */ }
}

const providers = [new NugetNameProvider, new NugetVersionProvider];
module.exports = providers;
