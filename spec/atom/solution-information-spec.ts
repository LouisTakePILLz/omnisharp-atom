/// <reference path="../tsd.d.ts" />
import Omni from "../../lib/omni-sharp-server/omni";
import {Observable, CompositeDisposable} from "@reactivex/rxjs";
import {setupFeature, restoreBuffers, openEditor} from "../test-helpers";

describe("Solution Information", () => {
    setupFeature(["atom/solution-information"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:next-solution-status"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:solution-status"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:previous-solution-status"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:stop-server"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:start-server"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:restart-server"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
