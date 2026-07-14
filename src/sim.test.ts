import { describe, expect, it } from "vitest";
import { distance } from "./math";
import { findPath } from "./map";
import { Simulation } from "./sim";

describe("Tactical squad orders", () => {
  it("assigns the strongest selected scavenger and moves the others to cover", () => {
    const simulation = new Simulation();
    simulation.selectAll();
    simulation.issueBreach();
    const cache = simulation.state.caches[0];

    const operator = simulation.issueScavenge(cache.id);

    expect(operator?.name).toBe("HOLT");
    expect(operator?.interaction).toBe(cache.id);
    const defenders = simulation.state.units.filter((unit) => unit !== operator);
    expect(defenders.every((unit) => unit.interaction === null)).toBe(true);
    expect(defenders.every((unit) => distance(unit.target, cache.pos) <= 4)).toBe(true);
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
    simulation.issueBreach();
    const cache = simulation.state.caches[0];
    simulation.issueMove(cache.pos);

    for (let index = 0; index < 600; index += 1) simulation.update(0.05);

    expect(cache.progress).toBe(0);
    expect(simulation.state.units.every((unit) => unit.interaction === null)).toBe(true);
  });

  it("uses diagonal path segments and avoids movement-blocking props", () => {
    const simulation = new Simulation();
    simulation.state.map.breach.open = true;

    const start = { x: 7.5, y: 18.5 };
    const path = findPath(simulation.state.map, start, { x: 55.5, y: 33.5 });

    expect(path.length).toBeGreaterThan(0);
    expect(path.some((point, index) => {
      const previous = index === 0 ? start : path[index - 1];
      return point.x !== previous.x && point.y !== previous.y;
    })).toBe(true);
    expect(path.every((point) => !simulation.state.map.movementBlocked.has(`${Math.floor(point.x)},${Math.floor(point.y)}`))).toBe(true);
  });

  it("keeps the landing isolated until the squad opens the breach", () => {
    const simulation = new Simulation();
    const destination = simulation.state.caches[0].pos;

    expect(findPath(simulation.state.map, simulation.state.map.insertion, destination)).toHaveLength(0);
    expect(simulation.issueBreach()).toBe(true);
    expect(findPath(simulation.state.map, simulation.state.map.insertion, destination).length).toBeGreaterThan(0);
  });

  it("allows withdrawal after one cache while distinguishing a full clear", () => {
    const simulation = new Simulation();
    simulation.state.caches[0].secured = true;
    for (const unit of simulation.state.units) unit.pos = { ...simulation.state.map.extraction };

    expect(simulation.canExtract()).toBe(true);
    simulation.extract();
    const outcome = simulation.outcome();
    expect(outcome.cachesRecovered).toBe(1);
    expect(outcome.objectiveCompleted).toBe(false);
  });

  it("keeps initial perimeter spawns outside the squad reaction envelope", () => {
    const simulation = new Simulation();
    const closest = Math.min(...simulation.state.contacts.flatMap((contact) =>
      simulation.state.units.map((unit) => distance(contact.pos, unit.pos)),
    ));

    expect(closest).toBeGreaterThan(12);
  });
});
