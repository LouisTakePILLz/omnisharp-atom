/// <reference path="../tsd.d.ts" />
import Omni from "../../lib/omni-sharp-server/omni";
import {Observable, CompositeDisposable} from "@reactivex/rxjs";
import {setupFeature, restoreBuffers, openEditor} from "../test-helpers";

describe("Go To Definition", () => {
    setupFeature(["features/go-to-definition"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:go-to-definition"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
