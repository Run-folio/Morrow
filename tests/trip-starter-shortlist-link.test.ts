import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { shortlistedStays, stayShortlistDestinationKey } from "../lib/easyt/trip-starter.ts";
import { stayWorkspaceHref } from "../lib/easyt/trip-workspace-links.ts";
import type { EasyTTrip, TripStop } from "../lib/easyt/trip.ts";

// Evaluate the real footer destination and its selectors, without a browser or
// a reimplementation of the component's stop-selection rules.
const source=ts.createSourceFile("trip-starter.tsx",readFileSync(new URL("../components/easyt/trip-starter.tsx",import.meta.url),"utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const selectors=new Map<string,string>();
let footerHref="";
function visit(node:ts.Node) {
 if(ts.isVariableDeclaration(node) && node.initializer && ["stops","savedStays","shortlistStop"].includes(node.name.getText(source))) selectors.set(node.name.getText(source),node.initializer.getText(source));
 if(ts.isJsxElement(node) && node.openingElement.tagName.getText(source)==="EasyTLinkButton" && node.children.some(child=>ts.isJsxText(child) && child.text.includes("View shortlist"))) {
  const href=node.openingElement.attributes.properties.find(attr=>ts.isJsxAttribute(attr) && attr.name.getText(source)==="href") as ts.JsxAttribute;
  if(href?.initializer && ts.isJsxExpression(href.initializer) && href.initializer.expression) footerHref=href.initializer.expression.getText(source);
 }
 ts.forEachChild(node,visit);
}
visit(source);
function href(trip:EasyTTrip,selectedStopId:string) {
 assert.equal(selectors.size,3);assert.ok(footerHref);
 const declarations=[...selectors].map(([name,value])=>`const ${name}=${value};`).join("\n");
 return runInNewContext(`${declarations}\n${footerHref}`,{trip,stop:trip.stops.find(stop=>stop.id===selectedStopId),shortlistedStays,stayWorkspaceHref}) as string;
}
const stop=(id:string,order:number,canonicalPlaceId=id):TripStop=>({id,order,name:canonicalPlaceId,country:"Japan",canonicalPlaceId,nights:2,latitude:35,longitude:135,arrivalDate:"2026-11-10",departureDate:"2026-11-12"});
function fixture(stops:TripStop[],savedStopIds:string[]) {
 return {id:"trip-starter-links",stops,brief:{stayShortlist:savedStopIds.map(stopId=>({stopId,destinationKey:stayShortlistDestinationKey(stops.find(stop=>stop.id===stopId)!),placeId:`hotel-${stopId}`,provider:"openstreetmap",name:"Example hotel"}))}} as EasyTTrip;
}
const target=(link:string)=>{const url=new URL(link,"https://morrovia.invalid");assert.equal(url.hash,"#stay-shortlist");return url.searchParams.get("stop");};

test("Starter shortlist link reaches a later saved stop from the first location",()=>{
 const trip=fixture([stop("tokyo",0),stop("kyoto",1)],["kyoto"]);
 assert.equal(target(href(trip,"tokyo")),"kyoto");
});
test("Starter shortlist link prefers the selected occurrence when both repeated visits have stays",()=>{
 const trip=fixture([stop("tokyo-first",0,"tokyo"),stop("tokyo-return",2,"tokyo")],["tokyo-first","tokyo-return"]);
 assert.equal(target(href(trip,"tokyo-return")),"tokyo-return");
 assert.equal(target(href(trip,"tokyo-first")),"tokyo-first");
});
test("Starter shortlist fallback uses trip order rather than shortlist or storage order",()=>{
 const trip=fixture([stop("last",2),stop("first",0),stop("middle",1)],["last","middle"]);
 assert.equal(target(href(trip,"first")),"middle");
});
test("Starter shortlist link ignores removed stops and stale destination bindings",()=>{
 const trip=fixture([stop("first",0),stop("later",1),stop("removed",2)],["first","removed","later"]);
 trip.stops=trip.stops.filter(stop=>stop.id!=="removed");
 trip.stops[0]={...trip.stops[0]!,canonicalPlaceId:"replacement"};
 assert.equal(target(href(trip,"first")),"later");
});
test("Starter empty shortlist keeps a safe Stay destination and anchor",()=>{
 const trip=fixture([stop("first",0)],[]);
 assert.equal(href(trip,"first"),"/journey/trip-starter-links/stay#stay-shortlist");
});
