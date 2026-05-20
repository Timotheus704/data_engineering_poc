import { ZodTypeAny, ZodFirstPartyTypeKind } from 'zod';

function unwrap(schema: ZodTypeAny) {
  let s: any = schema as any;
  let optional = false;
  let nullable = false;
  while (s && s._def && (s._def.typeName === 'ZodOptional' || s._def.typeName === 'ZodDefault' || s._def.typeName === 'ZodNullable')) {
    if (s._def.typeName === 'ZodOptional' || s._def.typeName === 'ZodDefault') optional = true;
    if (s._def.typeName === 'ZodNullable') nullable = true;
    s = s._def.innerType || s._def.type || s._def.schema || s._def.argument || s._def;
  }
  return { schema: s, optional, nullable };
}

export function zodToJsonSchema(zodSchema: ZodTypeAny): any {
  function visit(s: ZodTypeAny): any {
    const { schema, optional, nullable } = unwrap(s);
    const t = (schema._def.typeName as unknown) as string;
    if (t === 'ZodObject') {
      const props: Record<string, any> = {};
      const required: string[] = [];
      const shape = (schema as any)._def.shape();
      for (const key of Object.keys(shape)) {
        const child = shape[key];
        const { schema: childSchema, optional: childOptional } = unwrap(child);
        props[key] = visit(child);
        if (!childOptional) required.push(key);
      }
      const out: any = { type: 'object', properties: props };
      if (required.length) out.required = required;
      return out;
    }
    if (t === 'ZodString') {
      const out: any = { type: 'string' };
      return (nullable ? { anyOf: [out, { type: 'null' }] } : out);
    }
    if (t === 'ZodNumber') {
      const out: any = { type: 'number' };
      return (nullable ? { anyOf: [out, { type: 'null' }] } : out);
    }
    if (t === 'ZodBoolean') {
      const out: any = { type: 'boolean' };
      return (nullable ? { anyOf: [out, { type: 'null' }] } : out);
    }
    if (t === 'ZodArray') {
      const items = visit((schema as any)._def.type);
      const out: any = { type: 'array', items };
      return out;
    }
    return {};
  }

  return visit(zodSchema);
}
