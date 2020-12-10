import { FunctionalComponent } from '@stencil/core';
import type { Router, RouterOptions, InternalRouterState, RouteProps } from './types';
export declare const createWindowRouter: (win: Window, doc: Document, loc: Location, hstry: History, opts: RouterOptions) => {
    router: Router;
    state: InternalRouterState;
};
export declare const href: (href: string, router?: Router | undefined) => {
    href?: undefined;
    onClick?: undefined;
} | {
    href: string;
    onClick?: undefined;
} | {
    href: string;
    onClick: (ev: MouseEvent) => void;
};
export declare const Route: FunctionalComponent<RouteProps>;
export declare const createRouter: (opts?: RouterOptions) => Router;
export declare const NotFound: () => void;
