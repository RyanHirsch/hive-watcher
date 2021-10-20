/* eslint-disable @typescript-eslint/no-explicit-any */

export type TODO = any;

/** Represents basic object type with typed values */
export type Obj<ValueT = any> = Record<string, ValueT>;
/** An empty object with no keys. Using {} means any non-nullish value, not an object with no keys */
export type EmptyObj = Obj<never>;
/** An object with unknown values. It provides a little extra safety over  because the user must explicitly cast to a type if using built in methods off the value. ie  or */
export type UnknownObj = Obj<unknown>;
