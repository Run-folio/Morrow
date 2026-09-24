import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProductDemo from "./product-demo";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import styles from "./immersive.module.css";
const routes = immersiveHomepageRoutes();
function Sample({ initialView = "builder" }: { initialView?: "builder" | "itinerary" }) { const [index, setIndex] = useState(0); return <main className={styles.page}><ProductDemo routes={routes} route={routes[index]} change={setIndex} initialView={initialView} /></main>; }
const meta = { title: "Morrovia/05 Product Patterns/Homepage/Product showcase", component: Sample, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Sample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const BuilderDesktop1440: Story = { args: { initialView: "builder" }, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const BuilderTablet768: Story = { args: { initialView: "builder" }, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const BuilderMobile390: Story = { args: { initialView: "builder" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BuilderMobile320: Story = { args: { initialView: "builder" }, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const ItineraryDesktop1440: Story = { args: { initialView: "itinerary" }, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const ItineraryTablet768: Story = { args: { initialView: "itinerary" }, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const ItineraryMobile390: Story = { args: { initialView: "itinerary" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const ItineraryMobile320: Story = { args: { initialView: "itinerary" }, globals: { viewport: { value: "morrovia320", isRotated: false } } };
