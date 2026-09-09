import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProductDemo from "./product-demo";
import { immersiveHomepageRoutes } from "@/lib/easyt/immersive-homepage-routes";
import styles from "./immersive.module.css";
const routes = immersiveHomepageRoutes();
function Sample() { const [index, setIndex] = useState(0); return <main className={styles.page}><ProductDemo routes={routes} route={routes[index]} change={setIndex} /></main>; }
const meta = { title: "Morrovia/05 Product Patterns/Homepage/Product showcase", component: Sample, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Sample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
