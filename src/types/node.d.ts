declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface WriteStream {
    write: (data: string) => void;
  }
  interface ReadStream {
    [key: string]: any;
  }
  interface ImportMeta {
    url: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
  exit: (code?: number) => never;
  argv: string[];
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
};

declare const console: {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  info: (...args: any[]) => void;
};

declare const require: NodeRequire;

declare const module: NodeModule;

declare const exports: any;

declare const __dirname: string;
declare const __filename: string;

declare module 'fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
  export function copyFileSync(src: string, dest: string): void;
  export const promises: {
    readFile: (path: string, encoding: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
  };
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function resolve(...paths: string[]): string;
  export const sep: string;
}

declare module 'readline' {
  export interface Interface {
    prompt(): void;
    close(): void;
    on(event: string, listener: (...args: any[]) => void): Interface;
    setPrompt(prompt: string): void;
  }

  export function createInterface(options: {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
    prompt?: string;
    completer?: (line: string) => [string[], string];
  }): Interface;
}

declare module 'url' {
  export function fileURLToPath(url: string): string;
  export function pathToFileURL(path: string): string;
}
