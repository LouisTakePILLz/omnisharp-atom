/// <reference path="../tsd.d.ts" />
import Omni from "../../lib/omni-sharp-server/omni";
import {Observable, CompositeDisposable} from "@reactivex/rxjs";
import {setupFeature, restoreBuffers, openEditor} from "../test-helpers";

describe("Navigation", () => {
    setupFeature(["features/navigate-up-down"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:navigate-up"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:navigate-down"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
