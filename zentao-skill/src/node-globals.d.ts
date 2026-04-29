declare const process: {
  argv: string[];
  exit(code?: number): never;
};

declare module "node:fs" {
  export function chmodSync(path: string, mode: number): void;
  export function existsSync(path: string): boolean;
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
