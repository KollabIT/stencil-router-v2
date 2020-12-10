export interface MatchOptions {
    exact?: boolean;
    strict?: boolean;
}
export declare const match: (pathname: string, options?: MatchOptions) => (path: string) => {
    [key: string]: string;
} | undefined;
export declare const matchAny: (pathnames: string[], options?: MatchOptions) => (path: string) => {
    [key: string]: string;
} | undefined;
