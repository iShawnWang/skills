declare const process: {
  argv: string[];
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
  exit(code?: number): never;
};

declare module "node:fs" {
  export function chmodSync(path: string, mode: number): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: "hex"): string };
  };
}

declare class Buffer {
  static isBuffer(value: unknown): boolean;
  static from(value: string | ArrayBufferLike): Buffer;
  static concat(list: Buffer[]): Buffer;
  toString(encoding?: string): string;
}

declare module "node:http" {
  interface IncomingMessage extends AsyncIterable<Buffer> {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
  }

  interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(data?: string): void;
  }

  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
  ): {
    listen(port: number, host: string, callback?: () => void): void;
    close(callback?: () => void): void;
  };
}
