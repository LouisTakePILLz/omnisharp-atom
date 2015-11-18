/// <reference path="../tsd.d.ts" />
/// <reference path="../typings/jasmine/jasmine.d.ts" />

declare function waitsForPromise<T>(callback: () => Promise<T>): void;
declare function waitsForPromise<T>(callback: () => Q.Promise<T>): void;
declare function waitsForPromise<T>(callback: () => Promise<T>): void;

declare module jasmine {
    interface Matchers {
        toExist(): void;
    }
}
declare module chai {
    interface Assert {
        isAbove(valueToCheck: number, valueToBeAbove: number, message?: string): void;
    }
}
