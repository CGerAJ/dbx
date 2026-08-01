export type CardinalityChoice = "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";

export type CardinalityPair = {
  sourceCardinality: "1" | "N";
  targetCardinality: "1" | "N";
};

export function cardinalityPairFromChoice(choice: CardinalityChoice): CardinalityPair {
  if (choice === "one-to-one") return { sourceCardinality: "1", targetCardinality: "1" };
  if (choice === "one-to-many") return { sourceCardinality: "1", targetCardinality: "N" };
  if (choice === "many-to-many") return { sourceCardinality: "N", targetCardinality: "N" };
  return { sourceCardinality: "N", targetCardinality: "1" };
}

export function cardinalityChoiceFromPair(pair: Partial<CardinalityPair> | null | undefined): CardinalityChoice {
  if (!pair) return "many-to-one";
  const s = pair.sourceCardinality;
  const t = pair.targetCardinality;
  if (s === "1" && t === "1") return "one-to-one";
  if (s === "1" && t === "N") return "one-to-many";
  if (s === "N" && t === "N") return "many-to-many";
  return "many-to-one";
}

/** Resolve endpoint cardinalities from a relationship; FK without explicit pair defaults to N:1. */
export function edgeCardinalityPair(rel: { sourceCardinality?: "1" | "N"; targetCardinality?: "1" | "N" } | null | undefined): CardinalityPair {
  if (rel?.sourceCardinality && rel?.targetCardinality) {
    return { sourceCardinality: rel.sourceCardinality, targetCardinality: rel.targetCardinality };
  }
  return { sourceCardinality: "N", targetCardinality: "1" };
}
