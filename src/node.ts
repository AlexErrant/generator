export class Node {
  constructor(readonly start: number) {}
}

export class GrammarDeclaration extends Node {
  constructor(start: number,
              readonly rules: readonly RuleDeclaration[],
              readonly tokens: TokenDeclaration | null,
              readonly externalTokens: readonly ExternalTokenDeclaration[],
              readonly precedences: PrecDeclaration | null,
              readonly mainSkip: Expression | null,
              readonly scopedSkip: readonly {expr: Expression, rules: readonly RuleDeclaration[]}[],
              readonly grammars: readonly ExternalGrammarDeclaration[]) {
    super(start)
  }
  toString() { return Object.values(this.rules).join("\n") }
}

export class RuleDeclaration extends Node {
  constructor(start: number,
              readonly id: Identifier,
              readonly tag: Tag | null,
              readonly params: readonly Identifier[],
              readonly expr: Expression) {
    super(start)
  }
  toString() {
    return this.id.name + (this.params.length ? `<${this.params.join()}>` : "") + " -> " + this.expr
  }
}

export class PrecDeclaration extends Node {
  constructor(start: number,
              readonly items: {id: Identifier, type: "left" | "right" | "cut" | null}[]) {
    super(start)
  }
}

export class TokenPrecDeclaration extends Node {
  constructor(start: number,
              readonly items: readonly (NamedExpression | LiteralExpression)[]) {
    super(start)
  }
}

export class TokenDeclaration extends Node {
  constructor(start: number,
              readonly precedences: readonly TokenPrecDeclaration[],
              readonly literals: readonly LiteralDeclaration[],
              readonly rules: readonly RuleDeclaration[]) {
    super(start)
  }
}

export class LiteralDeclaration extends Node {
  constructor(start: number, readonly literal: LiteralExpression, readonly tag: Tag) { super(start) }
}

export class ExternalTokenDeclaration extends Node {
  constructor(start: number,
              readonly id: Identifier,
              readonly source: string,
              readonly tokens: readonly {id: Identifier, tag: Tag | null}[]) {
    super(start)
  }
}

export class ExternalGrammarDeclaration extends Node {
  constructor(start: number,
              readonly id: Identifier,
              readonly externalID: Identifier,
              readonly source: string | null) {
    super(start)
  }
}

export class Identifier extends Node {
  constructor(start: number, readonly name: string) {
    super(start)
  }
  toString() { return this.name }
}

export class Expression extends Node {
  walk(f: (expr: Expression) => Expression): Expression { return f(this) }
  eq(other: Expression): boolean { return false }
}

export class NamedExpression extends Expression {
  constructor(start: number, readonly namespace: Identifier | null, readonly id: Identifier, readonly args: readonly Expression[]) {
    super(start)
  }
  toString() { return this.id.name + (this.args.length ? `<${this.args.join()}>` : "") }
  eq(other: NamedExpression) {
    return (this.namespace ? other.namespace != null && other.namespace.name == this.namespace.name : !other.namespace) &&
      this.id.name == other.id.name
  }
  walk(f: (expr: Expression) => Expression): Expression {
    let args = walkExprs(this.args, f)
    return f(args == this.args ? this : new NamedExpression(this.start, this.namespace, this.id, args))
  }
}

export class TaggedExpression extends Expression {
  constructor(start: number, readonly expr: Expression, readonly tag: Tag) { super(start) }

  toString() { return "(" + this.expr + "):" + this.tag }
  eq(other: TaggedExpression) {
    return exprEq(this.expr, other.expr) && String(this.tag) == String(other.tag)
  }
  walk(f: (expr: Expression) => Expression): Expression {
    let expr = this.expr.walk(f)
    return f(expr == this.expr ? this : new TaggedExpression(this.start, expr, this.tag))
  }
}

export class TagExpression extends Expression {
  constructor(start: number, readonly tag: Tag) { super(start) }

  toString() { return ":" + this.tag }
  eq(other: TagExpression) { return String(this.tag) == String(other.tag) }
}

export class ChoiceExpression extends Expression {
  constructor(start: number, readonly exprs: readonly Expression[]) {
    super(start)
  }
  toString() { return this.exprs.join(" | ") }
  eq(other: ChoiceExpression) {
    return exprsEq(this.exprs, other.exprs)
  }
  walk(f: (expr: Expression) => Expression): Expression {
    let exprs = walkExprs(this.exprs, f)
    return f(exprs == this.exprs ? this : new ChoiceExpression(this.start, exprs))
  }
}

export class SequenceExpression extends Expression {
  constructor(start: number, readonly exprs: readonly Expression[], readonly markers: readonly (readonly ConflictMarker[])[]) {
    super(start)
  }
  toString() { return this.exprs.join(" ") }
  eq(other: SequenceExpression) {
    return exprsEq(this.exprs, other.exprs) && this.markers.every((m, i) => {
      let om = other.markers[i]
      return m.length == om.length && m.every((x, i) => x.eq(om[i]))
    })
  }
  walk(f: (expr: Expression) => Expression): Expression {
    let exprs = walkExprs(this.exprs, f)
    return f(exprs == this.exprs ? this : new SequenceExpression(this.start, exprs, this.markers))
  }
}

export class ConflictMarker extends Node {
  constructor(start: number, readonly id: Identifier, readonly type: "ambig" | "prec") {
    super(start)
  }

  toString() { return (this.type == "ambig" ? "~" : "!") + this.id.name }

  eq(other: ConflictMarker) { return this.id.name == other.id.name && this.type == other.type }
}

export class RepeatExpression extends Expression {
  constructor(start: number, readonly expr: Expression, readonly kind: "?" | "*" | "+") {
    super(start)
  }
  toString() { return this.expr + this.kind }
  eq(other: RepeatExpression) {
    return exprEq(this.expr, other.expr) && this.kind == other.kind
  }
  walk(f: (expr: Expression) => Expression): Expression {
    let expr: Expression = this.expr.walk(f)
    return f(expr == this.expr ? this : new RepeatExpression(this.start, expr, this.kind))
  }
}

export class LiteralExpression extends Expression {
  // value.length is always > 0
  constructor(start: number, readonly value: string) {
    super(start)
  }
  toString() { return JSON.stringify(this.value) }
  eq(other: LiteralExpression) { return this.value == other.value }
}

export class SetExpression extends Expression {
  constructor(start: number, readonly ranges: [number, number][], readonly inverted: boolean) {
    super(start)
  }
  toString() {
    return `[${this.inverted ? "^" : ""}${this.ranges.map(([a, b]) => {
      return String.fromCodePoint(a) + (b == a + 1 ? "" : "-" + String.fromCodePoint(b))
    })}]`
  }
  eq(other: SetExpression) {
    return this.inverted == other.inverted && this.ranges.length == other.ranges.length &&
      this.ranges.every(([a, b], i) => { let [x, y] = other.ranges[i]; return a == x && b == y })
  }
}

export class AnyExpression extends Expression {
  constructor(start: number) {
    super(start)
  }
  toString() { return "_" }
  eq() { return true }
}

function walkExprs(exprs: readonly Expression[], f: (expr: Expression) => Expression): readonly Expression[] {
  let result: Expression[] | null = null
  for (let i = 0; i < exprs.length; i++) {
    let expr = exprs[i].walk(f)
    if (expr != exprs[i] && !result) result = exprs.slice(0, i)
    if (result) result.push(expr)
  }
  return result || exprs
}

export function exprEq(a: Expression, b: Expression): boolean {
  return a.constructor == b.constructor && a.eq(b as any)
}

export function exprsEq(a: readonly Expression[], b: readonly Expression[]) {
  return a.length == b.length && a.every((e, i) => exprEq(e, b[i]))
}

export class TagPart extends Node {}

export class Tag extends Node {
  constructor(start: number, readonly parts: readonly TagPart[]) { super(start) }

  toString() { return this.parts.join(".") }
}

export class TagName extends TagPart {
  constructor(start: number, readonly name: string) { super(start) }

  toString() { return /\W/.test(this.name) ? JSON.stringify(this.name) : this.name }
}

export class TagInterpolation extends TagPart {
  constructor(start: number, readonly id: Identifier) { super(start) }

  toString() { return "$" + this.id }
}

export class ValueTag extends TagPart {
  constructor(start: number, readonly name: TagPart, readonly value: TagPart) { super(start) }

  toString() { return this.name + "=" + this.value }
}
