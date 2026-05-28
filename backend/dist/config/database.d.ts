import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
declare const pool: Pool;
export declare const query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
export declare const getClient: () => Promise<PoolClient>;
export declare const checkDatabaseHealth: () => Promise<boolean>;
export declare const withTransaction: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
export { pool };
export default pool;
//# sourceMappingURL=database.d.ts.map