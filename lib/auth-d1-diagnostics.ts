const authTableModels = [
  ["rate_limit", "rateLimit"],
  ["session", "session"],
  ["user", "user"],
  ["account", "account"],
  ["verification", "verification"],
] as const;

type AuthDatabaseModel = (typeof authTableModels)[number][1] | "unknown";
type D1StatementOperation = "all" | "first" | "raw" | "run";

function logCheckpoint(
  event: string,
  model: AuthDatabaseModel,
  operation: D1StatementOperation,
): void {
  console.log(JSON.stringify({ event, model, operation }));
}

function logException(
  model: AuthDatabaseModel,
  operation: D1StatementOperation,
  error: unknown,
): void {
  const errorType = error instanceof Error ? error.name : "UnknownThrownValue";
  const message = error instanceof Error
    ? error.message
    : "A non-Error value was thrown by a D1 authentication operation.";
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(JSON.stringify({
    event: "auth_d1_operation_exception",
    model,
    operation,
    errorType,
    message,
    stack,
  }));
}

function classifyModel(query: string): AuthDatabaseModel {
  const normalized = query.toLowerCase();
  return authTableModels.find(([table]) => (
    normalized.includes(`"${table}"`) ||
    normalized.includes(`\`${table}\``) ||
    normalized.includes(`[${table}]`)
  ))?.[1] ?? "unknown";
}

function instrumentStatement(
  statement: D1PreparedStatement,
  model: AuthDatabaseModel,
  originals: WeakMap<D1PreparedStatement, D1PreparedStatement>,
): D1PreparedStatement {
  const wrapped = new Proxy(statement, {
    get(target, property) {
      if (property === "bind") {
        return (...values: unknown[]) => instrumentStatement(
          target.bind(...values),
          model,
          originals,
        );
      }

      if (
        property === "all" ||
        property === "first" ||
        property === "raw" ||
        property === "run"
      ) {
        return async (...args: unknown[]) => {
          const operation = property satisfies D1StatementOperation;
          logCheckpoint("auth_d1_operation_start", model, operation);
          try {
            const method = target[property] as (...methodArgs: unknown[]) => Promise<unknown>;
            const result = await method.apply(target, args);
            logCheckpoint("auth_d1_operation_complete", model, operation);
            return result;
          } catch (error) {
            logException(model, operation, error);
            throw error;
          }
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  originals.set(wrapped, statement);
  return wrapped;
}

export function instrumentAuthDatabase(database: D1Database): D1Database {
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();

  return new Proxy(database, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => instrumentStatement(
          target.prepare(query),
          classifyModel(query),
          originals,
        );
      }

      if (property === "batch") {
        return <T = unknown>(statements: D1PreparedStatement[]) => target.batch<T>(
          statements.map((statement) => originals.get(statement) ?? statement),
        );
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
