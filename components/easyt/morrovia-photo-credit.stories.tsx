import type { Meta, StoryObj } from "@storybook/react";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import { routeEditorialPhoto } from "@/lib/easyt/route-images";

const meta = { title: "Morrovia/02 Controls/Photo credit", component: MorroviaPhotoCredit } satisfies Meta<typeof MorroviaPhotoCredit>;
export default meta;
type Story = StoryObj<typeof meta>;

const unsplashPhoto = routeEditorialPhoto("published-stop-la-fortuna-costa-rica-55rZeNdxr-8")!;

export const Closed: Story = { args: { credit: "Basile Morin · CC BY-SA 4.0", photoLabel: "Tokyo, Japan", sourceHref: "https://commons.wikimedia.org/", licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/", fullCreditHref: "/journey/immersive/credits.html#tokyo" }, decorators: [(Story) => <div style={{ position:"relative", width:"min(390px, calc(100vw - 32px))", height:260, background:"linear-gradient(135deg,#263878,#11103f)" }}><Story /></div>] };

export const UnsplashCard: Story = { args: { credit: `${unsplashPhoto.author} · ${unsplashPhoto.license}`, photoLabel: unsplashPhoto.alt, authorHref: unsplashPhoto.authorUrl, sourceHref: unsplashPhoto.sourceUrl, licenseHref: unsplashPhoto.licenseUrl, placement: "bottom-left" }, decorators: [(Story) => <div style={{ position:"relative", width:"min(390px, calc(100vw - 32px))", height:260, overflow:"hidden", background:"linear-gradient(135deg,#263878,#11103f)" }}>{unsplashPhoto.variants.at(-1)?.src ? <img src={unsplashPhoto.variants.at(-1)!.src} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} /> : null}<Story /></div>] };

export const OwnedImageHasNoControl: Story = { args: { credit: "Morrovia photography", sourceHref: "https://morrovia.example/photo", ownership: "morrovia" }, decorators: [(Story) => <div style={{ position:"relative", width:"min(390px, calc(100vw - 32px))", height:260, background:"linear-gradient(135deg,#263878,#11103f)" }}><Story /></div>] };
