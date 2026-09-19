import type { StorageSnapshot } from "../../../packages/contracts/src/index.js";

export function createDemoStorage(): StorageSnapshot {
  const boxes = Array.from({ length: 6 }, (_, boxIndex) => {
    const targetCount = [41, 26, 53, 14, 36, 0][boxIndex];
    const samples = Array.from({ length: targetCount }, (_, sampleIndex) => ({
      name: `Échantillon ${String.fromCharCode(65 + (sampleIndex % 5))}${sampleIndex + 1}`,
      project: ["OncoMap", "Immuno-21", "Cohorte Alpha", "Pilot RNA"][(boxIndex + sampleIndex) % 4],
      experimenter: ["Dr Martin", "C. Bernard", "S. Nguyen"][(boxIndex + sampleIndex) % 3],
      description: sampleIndex % 3 === 0 ? "Aliquote de contrôle" : "",
      date: `2026-${String(((boxIndex + sampleIndex) % 9) + 1).padStart(2, "0")}-${String(((sampleIndex * 2) % 27) + 1).padStart(2, "0")}`,
      position: sampleIndex + 1,
      history: []
    }));

    return {
      id: `box-${boxIndex + 1}`,
      name: `Box ${String(boxIndex + 1).padStart(2, "0")}`,
      project: ["OncoMap", "Immuno-21", "Cohorte Alpha", "Pilot RNA"][boxIndex % 4],
      rows: 8,
      columns: 8,
      samples
    };
  });

  return {
    workspace: { id: "workspace-demo", name: "Laboratoire CryoBio" },
    freezers: [{
      id: "freezer-demo",
      name: "Freezer −80 °C",
      temperatureCelsius: -80,
      racks: [{ id: "rack-demo", name: "Rack A", boxes }]
    }]
  };
}
