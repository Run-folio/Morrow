import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import ProfileForm from "./profile-form";
import styles from "../account.module.css";

const meta = {
  title: "Pages/Profile",
  component: ProfileForm,
  args: {
    ownerId: "storybook-owner",
    name: "Sam Rivera",
    email: "traveller@example.com",
    initialLanguage: "en",
    initialTravelProfile: {
      pace: "balanced",
      priority: "mix",
      hotelMoves: "few",
      budget: "mid",
    },
    initialTravelReadinessProfile: {
      nationalities: [],
      residenceCountry: "",
      passportExpiryMonth: "",
    },
  },
  decorators: [
    (Story) => (
      <main className={styles.page}>
        <section className={styles.profileWrap}>
          <p className={styles.eyebrow}>Account settings</p>
          <h1>Your profile.</h1>
          <p className={styles.profileIntro}>Manage your details and the travel preferences Morrovia uses as a starting point for new trips.</p>
          <Story />
        </section>
      </main>
    ),
  ],
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ProfileForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { ownerId: "storybook-owner" },
};

export const LongValues: Story = {
  args: {
    ownerId: "storybook-owner-long-values",
    name: "Alexandra Montgomery-Rutherford",
    email: "alexandra.montgomery-rutherford@example-travel-company.com",
    initialTravelReadinessProfile: {
      nationalities: ["United Kingdom", "Saint Vincent and the Grenadines"],
      residenceCountry: "United States Minor Outlying Islands",
      passportExpiryMonth: "2031-11",
    },
  },
};

export const NarrowScreen: Story = {
  args: { ownerId: "storybook-owner-narrow" },
  parameters: { viewport: { defaultViewport: "morrovia320" } },
};
