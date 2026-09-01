import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import {
  StampedExperience,
  type StampedExperienceProps,
} from "../../app/journey/stamped/stamped-client";
import EasyTNavigation from "../../app/journey/easyt-navigation";
import type { StampStatus } from "../../lib/easyt/stamps";

type FixtureProps = {
  authenticated?: boolean;
  initialSelectedCountryId?: string;
  initialStatuses?: Record<string, StampStatus>;
  initialMemories?: Record<string, string>;
  initialPhotos?: Record<string, string>;
};

function StampsFixture({
  authenticated = true,
  initialSelectedCountryId,
  initialStatuses = {},
  initialMemories = {},
  initialPhotos = {},
}: FixtureProps) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [memories, setMemories] = useState(initialMemories);
  const [photos, setPhotos] = useState(initialPhotos);

  const changeStatus: StampedExperienceProps["onStatusChange"] = async (countryId, status) => {
    setStatuses((current) => {
      if (status) return { ...current, [countryId]: status };
      const next = { ...current };
      delete next[countryId];
      return next;
    });
  };

  const saveMemory: StampedExperienceProps["onMemorySave"] = async (countryId, note, photoData) => {
    setMemories((current) => {
      if (note) return { ...current, [countryId]: note };
      const next = { ...current };
      delete next[countryId];
      return next;
    });
    setPhotos((current) => {
      if (photoData) return { ...current, [countryId]: photoData };
      const next = { ...current };
      delete next[countryId];
      return next;
    });
    return true;
  };

  return <main style={{ minHeight: "100vh", overflow: "hidden", background: "var(--morrovia-paper)" }}>
    <EasyTNavigation
      current="stamped"
      account={authenticated ? { id: "storybook", name: "Alex", email: "alex@example.com" } : undefined}
    />
    <StampedExperience
      authenticated={authenticated}
      initialSelectedCountryId={initialSelectedCountryId}
      memories={memories}
      onMemorySave={saveMemory}
      onStatusChange={changeStatus}
      photos={photos}
      ready
      statuses={statuses}
    />
  </main>;
}

const establishedStatuses = {
  france: "visited",
  guatemala: "visited",
  italy: "visited",
  japan: "want",
  portugal: "want",
} satisfies Record<string, StampStatus>;

const meta = {
  title: "Morrovia/05 Product Patterns/Stamps",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/stamped" } },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const EstablishedTraveller: Story = {
  render: () => <StampsFixture
    initialSelectedCountryId="france"
    initialStatuses={establishedStatuses}
    initialMemories={{
      france: "Spring in Paris: café mornings, museum afternoons, and long walks beside the Seine.",
      guatemala: "Volcano light over Lake Atitlán.",
    }}
  />,
};

export const EmptyNewTraveller: Story = {
  render: () => <StampsFixture />,
};

export const GuestEmptyState: Story = {
  render: () => <StampsFixture authenticated={false} />,
};

export const SelectedVisitedCountry: Story = {
  render: () => <StampsFixture
    initialSelectedCountryId="france"
    initialStatuses={{ france: "visited" }}
  />,
};

export const SelectedWantToVisit: Story = {
  render: () => <StampsFixture
    initialSelectedCountryId="japan"
    initialStatuses={{ japan: "want" }}
  />,
};

export const CountryWithNote: Story = {
  render: () => <StampsFixture
    initialSelectedCountryId="guatemala"
    initialStatuses={{ guatemala: "visited" }}
    initialMemories={{ guatemala: "The market in Chichicastenango was all colour, incense, and rain." }}
  />,
};

export const NoImagery: Story = {
  render: () => <StampsFixture
    initialSelectedCountryId="france"
    initialStatuses={{ france: "visited" }}
    initialMemories={{ france: "A note-only memory remains complete without placeholder photography." }}
  />,
};

export const LongCountryName: Story = {
  render: () => <StampsFixture
    initialSelectedCountryId="democratic-republic-of-the-congo"
    initialStatuses={{ "democratic-republic-of-the-congo": "want" }}
  />,
};

export const Mobile390: Story = {
  globals: { viewport: { value: "morrovia390", isRotated: false } },
  render: () => <StampsFixture
    initialSelectedCountryId="france"
    initialStatuses={establishedStatuses}
    initialMemories={{ france: "Spring in Paris: café mornings, museum afternoons, and long walks beside the Seine." }}
  />,
};

export const Tablet768: Story = {
  globals: { viewport: { value: "morrovia768", isRotated: false } },
  render: () => <StampsFixture initialStatuses={establishedStatuses} />,
};
