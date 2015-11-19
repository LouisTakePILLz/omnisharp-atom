/// <reference path="../tsd.d.ts" />
import {expect} from "chai";
import {Omni} from "../../lib/omni-sharp-server/omni";
import {CompositeDisposable} from "../../lib/Disposable";
import {setupFeature, restoreBuffers} from "../test-helpers";
import {codeFormat} from "../../lib/omnisharp-atom/features/code-format";

describe("Code Format", () => {
    setupFeature(["features/code-format"]);

    it("adds commands", (done) => {
        const disposable = new CompositeDisposable();

        const commands: any = atom.commands;

        expect(commands.registeredCommands["omnisharp-atom:code-format"]).to.be.true;
        expect(commands.registeredCommands["omnisharp-atom:code-format-on-semicolon"]).to.be.true;
        expect(commands.registeredCommands["omnisharp-atom:code-format-on-curly-brace"]).to.be.true;

        disposable.dispose();
        done();
    });

    it("formats code", (done) => {
        const d = restoreBuffers();
        const disposable = new CompositeDisposable();
        disposable.add(d);

        atom.workspace.open("simple/code-format/UnformattedClass.cs")
            .then((editor) => {
                codeFormat.format(editor);

                return Omni.listener.formatRange
                    .take(1)
                    .delay(400)
                    .map(({request, response}) => ({editor, request, response}))
                    .toPromise();
            })
            .then(({request, editor}) => {
                expect(editor.getPath()).to.be.eql(request.FileName);
                const expected = `public class UnformattedClass
{
    public const int TheAnswer = 42;
}
`.replace(/\r|\n/g, "");
                const result = editor.getText().replace(/\r|\n/g, "");
                expect(result).to.contain(expected);
                disposable.dispose();
                done();
            });
    });
});
