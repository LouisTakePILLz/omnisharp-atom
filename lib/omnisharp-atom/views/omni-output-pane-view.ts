import {OmniSharpAtom} from "../../omnisharp.ts";
const convert = require("ansi-to-html");
import * as _ from "lodash";
import * as React from "react";
import {ReactClientComponent} from "./react-client-component";
import {server} from "../atom/server-information";

interface IOutputWindowState {
    output: OmniSharpAtom.OutputMessage[];
}

export class OutputWindow<T> extends ReactClientComponent<T, IOutputWindowState>  {
    public displayName = "OutputWindow";

    private _convert: any;

    constructor(props?: T, context?: any) {
        super(props, context);
        this._convert = new convert();
        this.state = { output: [] };
    }

    public componentDidMount() {
        super.componentDidMount();

        this.disposable.add(server.observe.output
            .subscribe(z => this.setState({ output: z }, () => this.scrollToBottom())));
        _.defer(_.bind(this.scrollToBottom, this));
    }

    private scrollToBottom() {
        const item = <any>React.findDOMNode(this).lastElementChild.lastElementChild;
        if (item) item.scrollIntoViewIfNeeded();
    }

    private createItem(item: OmniSharpAtom.OutputMessage, index: number) {
        return React.DOM.pre({
            key: `output-${index}`,
            className: item.logLevel,
            dangerouslySetInnerHTML: { __html: this._convert.toHtml(item.message).trim() }
        });
    }

    public render() {
        /* tslint:disable:no-string-literal */
        return React.DOM.div({
            className: "omni-output-pane-view native-key-bindings " + (this.props["className"] || ""),
            tabIndex: -1
        },
            React.DOM.div({
                className: "messages-container"
            }, _.map(this.state.output, (item, index) => this.createItem(item, index))));
        /* tslint:enable:no-string-literal */
    }
}
