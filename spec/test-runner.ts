/* tslint:disable:variable-name */
import * as Mocha from "mocha";
/* tslint:enable:variable-name */

module.exports = function(
    testPaths: string[],
    buildAtomEnvironment: (delegate: Function) => Atom.Atom,
    applicationDelegate: any,
    window: Window,
    document: Document,
    configDirPath: string,
    enablePersistence: boolean,
    buildDefaultApplicationDelegate: Function,
    logFile: string,
    headless: boolean
): Promise<number> {
    console.log(testPaths);
    const atom = buildAtomEnvironment(applicationDelegate);
    return Promise.resolve(1);
    const mocha = new Mocha({
        ui: "bdd",
        reporter: "html",
    });

    return new Promise<any>(resolve => {
        mocha.run(resolve);
    });
};
