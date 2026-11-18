/* @types/node 20-д node:sqlite байхгүй — ашигладаг хэсгийнх нь төрөл (Node 22.5+) */
declare module "node:sqlite" {
  type Value = string | number | bigint | null | Uint8Array;
  export class StatementSync {
    get(...params: Value[]): unknown;
    all(...params: Value[]): unknown[];
    run(...params: Value[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
