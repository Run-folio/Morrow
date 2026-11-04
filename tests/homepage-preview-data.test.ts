import assert from "node:assert/strict";
import test from "node:test";
import {previewStops, previewConnections} from "../app/journey/home/immersive/product-preview-data.ts";
import {destinationKnowledge} from "../lib/easyt/destination-knowledge.ts";
import {haversineKm} from "../lib/easyt/planner.ts";
import {routeFamilyByKey} from "../lib/easyt/route-catalog.ts";

test("sample timing snapshots retain their existing evidence and never infer the unsupported short leg", () => {
  for (const [index, connection] of previewConnections.entries()) {
    const from={...previewStops[index],country:"Japan"},to={...previewStops[index+1],country:"Japan"};
    assert.equal(connection.from,from.id);assert.equal(connection.to,to.id);
    const rail=destinationKnowledge.findIntercityRailConnection(from,to,haversineKm(from.coordinates,to.coordinates)!);
    if(connection.minutes !== null) {
      assert.ok(rail,"the displayed train requires existing service-level network evidence");
      const known=destinationKnowledge.findTransfer(from,to);
      const minutes=known?.planningMinutes.status === "known" ? known.planningMinutes.value : rail.planningMinutes;
      assert.equal(connection.minutes,minutes);
      const sources=known?.planningMinutes.status === "known" ? known.planningMinutes.sources : [rail.source];
      assert.ok(sources.some(source=>source.id===connection.source));
    } else {
      assert.equal(rail,undefined);
      const published=routeFamilyByKey["japan-slow"].connections.find(item=>item.from===from.name&&item.to===to.name);
      assert.equal(published?.mode,connection.mode);assert.equal(published?.planningMinutes,null);
    }
  }
});
