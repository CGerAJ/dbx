import type { ColumnInfo, DatabaseType } from "@/types/database";
import { getTableStructureCapabilities, type TableStructureDialect } from "@/lib/table/tableStructureCapabilities";
import { defaultNewColumnDataType, getDataTypeOptions } from "@/lib/table/tableStructureEditorState";

export interface DiagramDialectAdapter {
  databaseType: DatabaseType | undefined;
  supportsCreateTable: boolean;
  supportsCreateIndex: boolean;
  supportsComment: boolean;
  dataTypeOptions: string[];
  createDefaultIdColumn(): ColumnInfo;
  createEmptyColumn(name?: string): ColumnInfo;
}

const DEFAULT_ID_TYPE_BY_DIALECT: Partial<Record<TableStructureDialect, string>> = {
  mysql: "bigint",
  postgres: "bigint",
  sqlserver: "bigint",
  h2: "bigint",
  informix: "bigint",
  oracle: "NUMBER",
  sqlite: "INTEGER",
  duckdb: "INTEGER",
  clickhouse: "UInt64",
};

function resolveDefaultIdType(dialect: TableStructureDialect, dataTypeOptions: readonly string[]): string {
  const preferred = DEFAULT_ID_TYPE_BY_DIALECT[dialect];
  if (preferred && (dataTypeOptions.length === 0 || dataTypeOptions.includes(preferred))) {
    return preferred;
  }
  const integerLike = dataTypeOptions.find((type) => /^(bigint|int|integer|number|uint64|int64)/i.test(type.trim()));
  if (integerLike) return integerLike;
  return preferred ?? dataTypeOptions[0] ?? "bigint";
}

export function resolveDiagramDialectAdapter(databaseType?: DatabaseType): DiagramDialectAdapter {
  const caps = getTableStructureCapabilities(databaseType);
  const dataTypeOptions = getDataTypeOptions(databaseType);

  return {
    databaseType,
    supportsCreateTable: caps.createTable,
    supportsCreateIndex: caps.createIndex,
    supportsComment: caps.comment,
    dataTypeOptions,
    createDefaultIdColumn() {
      return {
        name: "id",
        data_type: resolveDefaultIdType(caps.dialect, dataTypeOptions),
        is_nullable: false,
        column_default: null,
        is_primary_key: true,
        comment: null,
        extra: null,
      };
    },
    createEmptyColumn(name = "column_1") {
      return {
        name,
        data_type: defaultNewColumnDataType(databaseType, dataTypeOptions),
        is_nullable: true,
        column_default: null,
        is_primary_key: false,
        comment: null,
        extra: null,
      };
    },
  };
}
