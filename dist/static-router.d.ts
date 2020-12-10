import type { MapParamData, PageState, RouterOptions, RouteParams } from './types';
export declare const staticState: (mapFn: MapParamData) => (params: RouteParams, url: URL) => PageState;
export declare const createStaticRouter: (opts?: RouterOptions) => import("./types").Router;
