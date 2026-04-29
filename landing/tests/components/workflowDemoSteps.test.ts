import { describe, it, expect } from "vitest";
import {
  WORKFLOW_STEPS,
  type WorkflowStep,
} from "@/components/WorkflowDemo/steps";

describe("WORKFLOW_STEPS", () => {
  it("is a non-empty array", () => {
    expect(WORKFLOW_STEPS.length).toBeGreaterThan(0);
  });

  it("has 6 steps", () => {
    expect(WORKFLOW_STEPS.length).toBe(6);
  });

  it("step IDs are sequential starting from 1", () => {
    WORKFLOW_STEPS.forEach((step, index) => {
      expect(step.id).toBe(index + 1);
    });
  });

  it("every step has required string fields", () => {
    for (const step of WORKFLOW_STEPS) {
      expect(typeof step.label).toBe("string");
      expect(step.label.length).toBeGreaterThan(0);
      expect(typeof step.sublabel).toBe("string");
      expect(step.sublabel.length).toBeGreaterThan(0);
      expect(typeof step.eyebrow).toBe("string");
      expect(typeof step.heading).toBe("string");
      expect(typeof step.caption).toBe("string");
    }
  });

  it("every step eyebrowColor is a valid value", () => {
    const validColors = ["violet", "emerald", "amber", "blue", "rose"] as const;
    for (const step of WORKFLOW_STEPS) {
      expect(validColors).toContain(step.eyebrowColor);
    }
  });

  it("proOnly is boolean when present", () => {
    for (const step of WORKFLOW_STEPS) {
      if (step.proOnly !== undefined) {
        expect(typeof step.proOnly).toBe("boolean");
      }
    }
  });

  it("satisfies WorkflowStep interface at runtime", () => {
    const first: WorkflowStep = WORKFLOW_STEPS[0];
    expect(first).toBeDefined();
    expect(first.id).toBe(1);
  });
});
