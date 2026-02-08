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

declare global {
  interface ImportMeta {
    url: string;
  }
}

declare module 'node:fs' {
  export * from 'fs';
}

declare module 'node:path' {
  export * from 'path';
}

declare module 'node:os' {
  export * from 'os';
}

declare module 'node:process' {
  export * from 'process';
}

declare module 'node:readline' {
  export * from 'readline';
}

declare module 'node:url' {
  export * from 'url';
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
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function copyFileSync(src: string, dest: string): void;
  export function statSync(path: string): any;
  export const promises: {
    readFile: (path: string, encoding: string) => Promise<string>;
    writeFile: (path: string, data: string) => Promise<void>;
  };
}

declare module 'os' {
  export function cpus(): any[];
  export function freemem(): number;
  export function totalmem(): number;
  export function homedir(): string;
}

declare module 'process' {
  export function cwd(): string;
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string): string;
  export function resolve(...paths: string[]): string;
  export function homedir(): string;
  export const sep: string;
}

declare module 'readline' {
  export interface Interface {
    prompt(): void;
    close(): void;
    on(event: string, listener: (...args: any[]) => void): Interface;
    setPrompt(prompt: string): void;
    question(query: string, callback: (answer: string) => void): void;
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
