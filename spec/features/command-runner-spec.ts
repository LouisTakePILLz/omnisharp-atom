/// <reference path="../tsd.d.ts" />
import {expect} from "chai";
import {CompositeDisposable} from "../../lib/Disposable";
import {Observable} from "@reactivex/rxjs";
import {setupFeature, openEditor} from "../test-helpers";
const win32 = process.platform === "win32";
import {getDnxExe} from "../../lib/omnisharp-atom/atom/command-runner";

describe("Command Runner", () => {
    const omniCb = setupFeature(["atom/command-runner"]);

    it("adds commands", (done) => {
        const disposable = new CompositeDisposable();
        openEditor(omniCb(), "commands/project.json")
            .mergeMapTo(Observable.merge(
                omniCb().solutions.map(z => true),
                omniCb().listener.model.projects.map(z => true)
            ).debounceTime(10000)
                .take(2))
            .subscribe(() => {

                const commands: any = atom.commands;

                expect(commands.registeredCommands["omnisharp-dnx:commands-[web]-(watch)"]).to.be.true;
                expect(commands.registeredCommands["omnisharp-dnx:commands-[kestrel]-(watch)"]).to.be.true;
                expect(commands.registeredCommands["omnisharp-dnx:commands-[run]"]).to.be.true;
                disposable.dispose();
            }, null, () => done());
    });

    it("returns the correct path for a given environment", (done) => {
        const result = getDnxExe(<any>{
            model: {
                runtimePath: "abc"
            }
        });

        if (win32) {
            expect(result).to.be.eql("abc\\bin\\dnx.exe");
        } else {
            expect(result).to.be.eql("abc/bin/dnx");
        }

        done();
    });

    // TODO: Add Tests for the daemon
});
