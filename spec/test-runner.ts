import {join} from "path";
import {readFileSync} from "fs";

module.exports = function(
    {testPaths, buildAtomEnvironment, buildDefaultApplicationDelegate}: {
        testPaths: string[];
        buildAtomEnvironment: (opts: any) => Atom.Atom;
        applicationDelegate: any;
        window: Window;
        document: Document;
        enablePersistence: boolean;
        buildDefaultApplicationDelegate: any;
        logFile: string;
        headless: boolean
    }): Promise<number> {
    console.log(testPaths);

    const applicationDelegate = buildDefaultApplicationDelegate();

    applicationDelegate.setRepresentedFilename = () => {/* */ };
    applicationDelegate.setWindowDocumentEdited = () => {/* */ };

    const mochaCtor: typeof Mocha = require("mocha");
    const globby: (paths: string[]) => Promise<string[]> = require("globby");

    const atom = buildAtomEnvironment({
        applicationDelegate: applicationDelegate,
        window, document,
        configDirPath: process.env.ATOM_HOME,
        enablePersistence: false
    });

    (<any>window).atom = atom;

    const mochaDiv = document.createElement("div");
    mochaDiv.id = "mocha";
    document.body.appendChild(mochaDiv);

    const mochaCss = document.createElement("style");
    mochaCss.innerHTML = readFileSync(join(__dirname, "..", "node_modules", "mocha", "mocha.css")).toString();
    document.head.appendChild(mochaCss);

    const mocha = new mochaCtor({
        ui: "bdd",
        reporter: "html",
    });

    return globby(testPaths.map(z => join(z, "**/*-spec.js")))
        .then(paths => {
            paths.forEach(path => {
                mocha.addFile(path);
            });

            return new Promise<any>(resolve => {
                mocha.run(resolve);
            });
        });

};
