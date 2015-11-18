/// <reference path="../tsd.d.ts" />
import Omni from "../../lib/omni-sharp-server/omni";
import {Observable, CompositeDisposable} from "@reactivex/rxjs";
import {setupFeature, restoreBuffers, openEditor} from "../test-helpers";

describe("Find Usages", () => {
    setupFeature(["features/find-usages"]);

    it("adds commands", () => {
        const disposable = new CompositeDisposable();

        runs(() => {
            const commands: any = atom.commands;

            expect(commands.registeredCommands["omnisharp-atom:find-usages"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:go-to-implementation"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:next-usage"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:go-to-usage"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:previous-usage"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:go-to-next-usage"]).toBeTruthy();
            expect(commands.registeredCommands["omnisharp-atom:go-to-previous-usage"]).toBeTruthy();
            disposable.dispose();
        });
    });

    // TODO: Test functionality
});
