import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EasyTNavigation from "../easyt-navigation";
import ContactForm from "./contact-form";
import styles from "./contact.module.css";

function ContactPageStory() {
  return <main className={`${styles.page} morrovia-editorial-page`}>
    <EasyTNavigation landing />
    <section className={styles.content}>
      <header className={styles.heading}><p>CONTACT MORROVIA</p><h1>How can we help?</h1><span>Ask about planning, your account, privacy or anything that is getting in the way of your trip.</span></header>
      <div className={styles.surface}><ContactForm /></div>
    </section>
  </main>;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Contact form",
  component: ContactPageStory,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
} satisfies Meta<typeof ContactPageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
export const Mobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const Mobile390: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const Mobile430: Story = { globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const Tablet768: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const Desktop1024: Story = { globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const Desktop1440: Story = { globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const Wide1680: Story = { globals: { viewport: { value: "morrovia1680", isRotated: false } } };
export const Invalid: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
  },
};
