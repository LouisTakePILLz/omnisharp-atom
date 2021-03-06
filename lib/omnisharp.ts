import {Api, Models} from "omnisharp-client";

export interface ExtendApi extends Api.V2 {
    request<TRequest, TResponse>(path: string, request: TRequest): Rx.Observable<TResponse>;
    path: string;
    whenConnected(): Rx.Observable<any>;
}

export interface IProjectViewModel {
    name: string;
    path: string;
    activeFramework: Models.DnxFramework;
    frameworks: Models.DnxFramework[];
    configurations: string[];
    commands: { [key: string]: string };
}
