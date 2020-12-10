export declare const isFunction: (v: any) => v is Function;
export declare const isPromise: <T = any>(v: any) => v is Promise<T>;
export declare const isString: (v: any) => v is string;
export declare const normalizePathname: (url: URL | Location) => string;
export declare const urlToPath: (url: URL | Location) => string;
export declare const shouldPushState: (loc: URL | Location, newUrl: URL) => boolean;
export declare const handlePushState: (win: Window, loc: URL | Location, hstry: History, isFromPopState: boolean, newUrl: URL) => void;
export declare const devDebug: (msg: string) => void;
