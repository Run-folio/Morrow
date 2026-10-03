import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import { routeEditorialPhoto } from "@/lib/easyt/route-images";

const meta = { title: "Morrovia/02 Controls/Photo credit", component: MorroviaPhotoCredit } satisfies Meta<typeof MorroviaPhotoCredit>;
export default meta;
type Story = StoryObj<typeof meta>;

const unsplashPhoto = routeEditorialPhoto("published-stop-la-fortuna-costa-rica-55rZeNdxr-8")!;

export const Closed: Story = { args: { credit: "Basile Morin · CC BY-SA 4.0", photoLabel: "Tokyo, Japan", sourceHref: "https://commons.wikimedia.org/", licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/", fullCreditHref: "/journey/immersive/credits.html#tokyo" }, decorators: [(Story) => <div style={{ position:"relative", width:"min(390px, calc(100vw - 32px))", height:260, background:"linear-gradient(135deg,#263878,#11103f)" }}><Story /></div>] };

export const UnsplashCard: Story = { args: { credit: `${unsplashPhoto.author} · ${unsplashPhoto.license}`, photoLabel: unsplashPhoto.alt, authorHref: unsplashPhoto.authorUrl, sourceHref: unsplashPhoto.sourceUrl, licenseHref: unsplashPhoto.licenseUrl, placement: "bottom-left" }, decorators: [(Story) => <div style={{ position:"relative", width:"min(390px, calc(100vw - 32px))", height:260, overflow:"hidden", background:"linear-gradient(135deg,#263878,#11103f)" }}>{unsplashPhoto.variants.at(-1)?.src ? <img src={unsplashPhoto.variants.at(-1)!.src} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} /> : null}<Story /></div>] };

export const CompactCard: Story = { args: { size: "compact", credit: "Basile Morin · CC BY-SA 4.0", photoLabel: "Tokyo, Japan", sourceHref: "https://commons.wikimedia.org/", licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/", fullCreditHref: "/journey/immersive/credits.html#tokyo" }, decorators: [(Story) => <div style={{ position:"relative", width:180, height:120, overflow:"hidden", background:"linear-gradient(135deg,#416ca4,#11103f)" }}><Story /></div>] };

export const OwnedImageHasNoControl: Story = {
  args: { credit: "Morrovia photography", sourceHref: "https://morrovia.example/photo", ownership: "morrovia" },
  decorators: [(Story) => <div style={{ position:"relative", width:"min(390px, calc(100vw - 32px))", height:260, background:"linear-gradient(135deg,#263878,#11103f)" }}><Story /></div>],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("button", { name: /Photo credit/ })).not.toBeInTheDocument();
  },
};

const dynamicUnsplashSource = "https://unsplash.com/@eibnersaliba?utm_source=morrovia&utm_medium=referral";

export const DynamicUnsplashMetadataFallback: Story = {
  args: {
    credit: "Photo by Eibner Saliba on Unsplash",
    sourceHref: dynamicUnsplashSource,
    sourceLabel: "Source",
  },
  decorators: [(Story) => <div style={{ position:"relative", width:280, height:180, background:"linear-gradient(135deg,#416ca4,#11103f)" }}><Story /></div>],
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Photo credit: Eibner Saliba on Unsplash" }));
    const disclosure = await within(document.body).findByRole("dialog", { name: "Photo information" });
    const photographer = within(disclosure).getByRole("link", { name: "Photo by Eibner Saliba" });
    await expect(photographer).toHaveAttribute("href", dynamicUnsplashSource);
    const provider = within(disclosure).getByRole("link", { name: "Unsplash" });
    await expect(provider).toHaveAttribute("href", "https://unsplash.com/?utm_source=morrovia&utm_medium=referral");
    await expect(within(disclosure).queryByText("Source")).not.toBeInTheDocument();
    await expect(within(disclosure).queryByText(/licen[cs]e/i)).not.toBeInTheDocument();
  },
};

export const ReviewedPhotoKeepsStructuredAttribution: Story = {
  args: {
    credit: "Basile Morin · CC BY-SA 4.0",
    authorLabel: "Basile Morin",
    authorHref: "https://commons.wikimedia.org/wiki/User:Basile_Morin",
    sourceLabel: "Wikimedia Commons",
    sourceHref: "https://commons.wikimedia.org/wiki/File:Tokyo.jpg",
    licenseLabel: "CC BY-SA 4.0",
    licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/",
    fullCreditHref: "/journey/immersive/credits.html#tokyo",
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Photo credit: Basile Morin/ }));
    const disclosure = await within(document.body).findByRole("dialog", { name: "Photo information" });
    await expect(within(disclosure).getByRole("link", { name: "Photo by Basile Morin" })).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/User:Basile_Morin");
    await expect(within(disclosure).getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:Tokyo.jpg");
    await expect(within(disclosure).getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(within(disclosure).getByRole("link", { name: "Full image credits" })).toHaveAttribute("href", "/journey/immersive/credits.html#tokyo");
  },
};

export const GenericNonUnsplashSourceRemainsVisible: Story = {
  args: {
    credit: "Photograph courtesy of the city archive",
    sourceHref: "https://example.org/archive/photo",
    sourceLabel: "City archive",
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Photo credit/ }));
    const disclosure = await within(document.body).findByRole("dialog", { name: "Photo information" });
    await expect(within(disclosure).getByRole("link", { name: "City archive" })).toHaveAttribute("href", "https://example.org/archive/photo");
    await expect(within(disclosure).queryByText(/licen[cs]e/i)).not.toBeInTheDocument();
  },
};
