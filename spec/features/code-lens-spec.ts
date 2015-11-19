import {Observable} from "@reactivex/rxjs";
/// <reference path="../tsd.d.ts" />
import {expect} from "chai";
import {Omni} from "../../lib/omni-sharp-server/omni";
import {setupFeature, openEditor} from "../test-helpers";
import {codeLens, Lens} from "../../lib/omnisharp-atom/features/code-lens";

describe("Code Lens", () => {
    setupFeature(["features/code-lens"]);

    (<any>Lens.prototype)._isVisible = () => true;

    it("should add code lens", (done) => {
        Observable.zip(
            openEditor("simple/code-lens/CodeLens.cs"),
            Omni.listener.currentfilemembersasflat
                .debounceTime(1000))
            .take(1)
            .subscribe((ctx) => {
                const editor = ctx[0].editor;
                const map: WeakMap<Atom.TextEditor, Set<Lens>> = (<any>codeLens).decorations;
                const lenses = map.get(editor);

                expect(lenses.size).to.be.eql(15);
            }, null, () => done());
    });

    it("should handle editor switching", (done) => {
        openEditor("simple/code-lens/CodeLens.cs")
            .mergeMap(() => Omni.listener.currentfilemembersasflat.debounceTime(1000).take(1))
            .mergeMap(() => openEditor("simple/code-lens/CodeLens2.cs"))
            .mergeMap(() => Omni.listener.currentfilemembersasflat.debounceTime(1000).take(1))
            .mergeMap(() => openEditor("simple/code-lens/CodeLens.cs"))
            .mergeMap((ctx) => Omni.listener.currentfilemembersasflat.debounceTime(1000).take(1).map(() => ctx))
            .subscribe(({editor}) => {
                expect(editor.getDecorations().length).to.be.greaterThan(9);
            }, null, () => done());
    });
});
