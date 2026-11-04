import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EasyTField } from "@/components/easyt/easyt-controls";
import ProductDemo from "./product-demo";
import styles from "./immersive.module.css";
function Sample() { return <main className={styles.page}><ProductDemo /><section id="start-building"><div data-homepage-origin><EasyTField label="Starting from" /></div></section></main>; }
const meta = { title: "Morrovia/05 Product Patterns/Homepage/Product showcase", component: Sample, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Sample>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PreviewDesktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const PreviewTablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const PreviewMobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const PreviewMobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
