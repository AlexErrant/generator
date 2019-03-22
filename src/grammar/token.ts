import {Term} from "./grammar"

export class Edge {
  public target!: State
  constructor(readonly from: number, readonly to: number = from + 1, target?: State) {
    if (target) this.target = target
  }

  toString() {
    return `-> ${this.target.id}[label=${JSON.stringify(
      this.from < 0 ? "ε" : String.fromCodePoint(this.from) +
        (this.to > this.from + 1 ? "-" + String.fromCodePoint(this.to) : ""))}]`
  }
}

let stateID = 1

export class State {
  edges: Edge[] = []
  accepting: Term[] = []
  id = stateID++

  connect(edges: Edge[]) {
    for (let e of edges) {
      if (e.target) throw new Error("Trying to connect edge twice")
      e.target = this
    }
  }

  edge(from: number, to: number = from + 1, target?: State) {
    let e = new Edge(from, to, target)
    this.edges.push(e)
    return e
  }

  nullEdge(target?: State) { return this.edge(-1, -1, target) }

  compile() {
    let labeled: {[id: string]: State} = Object.create(null)
    return explore(this.closure())

    function explore(states: State[]) {
      // FIXME properly compare and split ranges. Optimize
      let out: Edge[] = []
      let newState = labeled[ids(states)] = new State
      for (let state of states) {
        for (let acc of state.accepting)
          if (!newState.accepting.includes(acc)) newState.accepting.push(acc)
        for (let edge of state.edges)
          if (edge.from >= 0) out.push(edge)
      }
      let transitions = mergeEdges(out)
      for (let merged of transitions) {
        let targets = merged.targets.sort((a, b) => a.id - b.id)
        newState.edge(merged.from, merged.to, labeled[ids(targets)] || explore(targets))
      }
      return newState
    }
  }

  closure() {
    let result: State[] = [this]
    for (let edge of this.edges) if (edge.from < 0 && !result.includes(edge.target)) result.push(edge.target)
    return result
  }

  simulate(input: string, pos: number): {term: Term, end: number}[] {
    let result = []
    for (let state: State = this; pos < input.length;) {
      let next = input.codePointAt(pos)!
      pos += next > 0xffff ? 2 : 1
      let edge = state.edges.find(e => e.from <= next && e.to > next)
      if (!edge) break
      state = edge.target
      // FIXME try to avoid pushing duplicate tokens
      for (let acc of state.accepting) result.push({term: acc, end: pos})
    }
    return result
  }

  toString() {
    return `digraph {\n${this.toGraphViz([])}\n}`
  }

  toGraphViz(seen: State[]) {
    let out = ""
    if (this.accepting.length)
      out += `  ${this.id} [label=${this.accepting.map(t => t.name).join()}];\n`
    for (let edge of this.edges)
      out += `  ${this.id} ${edge};\n`
    for (let edge of this.edges) {
      if (!seen.includes(edge.target)) {
        seen.push(edge.target)
        out += edge.target.toGraphViz(seen)
      }
    }
    return out
  }
}

function ids(states: State[]) {
  let result = ""
  for (let state of states) result += (result.length ? "-" : "") + state.id
  return result
}

class MergedEdge {
  constructor(readonly from: number, readonly to: number, readonly targets: State[]) {}
}

// Merge multiple edges (tagged by character ranges) into a set of
// mutually exclusive ranges pointing at all target states for that
// range
function mergeEdges(edges: Edge[]): MergedEdge[] {
  let separate: number[] = [], result: MergedEdge[] = []
  for (let edge of edges) {
    if (!separate.includes(edge.from)) separate.push(edge.from)
    if (!separate.includes(edge.to)) separate.push(edge.to)
  }
  separate.sort((a, b) => a - b)
  for (let i = 1; i < separate.length; i++) {
    let from = separate[i - 1], to = separate[i]
    let found: State[] = []
    for (let edge of edges) if (edge.to > from && edge.from < to) {
      for (let target of edge.target.closure()) if (!found.includes(target))
        found.push(target)
    }
    if (found.length) result.push(new MergedEdge(from, to, found))
  }
  return result
}
