/// <reference path="tsd.d.ts" />
import {expect} from "chai";
import {DriverState} from "omnisharp-client";
import {Observable} from "@reactivex/rxjs";
import {setupFeature} from "./test-helpers";

describe("OmniSharp Atom", () => {
    const omniCb = setupFeature([]);

    describe("when the package is activated", () => {
        it("connect", (done) => {
            Observable.fromPromise<Atom.TextEditor>(<any>atom.workspace.open("simple/code-lens/CodeLens.cs"))
                .mergeMap(editor => omniCb().getSolutionForEditor(editor))
                .mergeMap(x => x.state.startWith(x.currentState))
                .filter(z => z === DriverState.Connected)
                .take(1)
                .subscribe(() => {
                    expect(omniCb().solutionManager.connected).to.be.true;
                    done();
                }, null, () => done());
        });

        it("connect-simple2", (done) => {
            Observable.fromPromise(
                Promise.all([
                    atom.workspace.open("simple/code-lens/CodeLens.cs"),
                    atom.workspace.open("simple2/project.json")
                ])
            )
                .mergeMap(x => Observable.from(x))
                .mergeMap(editor => omniCb().getSolutionForEditor(editor))
                .mergeMap(x => x.state.startWith(x.currentState))
                .filter(z => z === DriverState.Connected)
                .take(2)
                .subscribe({
                    complete: () => {
                        expect(omniCb().solutionManager.connected).to.be.true;
                        expect(omniCb().solutionManager.activeSolutions.length).to.be.eql(2);
                        done();
                    }
                });
        });
    });
});
