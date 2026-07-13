import { describe, expect, it } from "vitest";
import { distance } from "./math";
import { Simulation } from "./sim";

describe("Tactical squad orders", () => {
  it("assigns the strongest selected scavenger and moves the others to cover", () => {
    const simulation = new Simulation();
    simulation.selectAll();

    const operator = simulation.issueScavenge();

    expect(operator?.name).toBe("HOLT");
    expect(operator?.interaction).toBe("cache");
    const defenders = simulation.state.units.filter((unit) => unit !== operator);
    expect(defenders.every((unit) => unit.interaction === null)).toBe(true);
    expect(defenders.every((unit) => distance(unit.target, simulation.state.map.cache) <= 4)).toBe(true);
  });

  it("gives a multi-selected squad distinct formation slots at a shared speed", () => {
    const simulation = new Simulation();
    simulation.selectAll();

    simulation.issueMove({ x: 30, y: 18 });

    const targets = simulation.state.units.map((unit) => `${unit.target.x},${unit.target.y}`);
    expect(new Set(targets).size).toBe(simulation.state.units.length);
    expect(new Set(simulation.state.units.map((unit) => unit.moveSpeed)).size).toBe(1);
  });

  it("does not begin scavenging from an ordinary move order", () => {
    const simulation = new Simulation();
    simulation.selectAll();
    simulation.issueMove(simulation.state.map.cache);

    for (let index = 0; index < 600; index += 1) simulation.update(0.05);

    expect(simulation.state.cacheProgress).toBe(0);
    expect(simulation.state.units.every((unit) => unit.interaction === null)).toBe(true);
  });
});
