import type { Meta, StoryObj } from "@storybook/react";
import MorroviaPhotoCredit from "./morrovia-photo-credit";

const meta = { title: "Morrovia/02 Controls/Photo credit", component: MorroviaPhotoCredit } satisfies Meta<typeof MorroviaPhotoCredit>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = { args: { credit: "Basile Morin · CC BY-SA 4.0", photoLabel: "Tokyo, Japan", sourceHref: "https://commons.wikimedia.org/", licenseHref: "https://creativecommons.org/licenses/by-sa/4.0/", fullCreditHref: "/journey/immersive/credits.html#tokyo" }, decorators: [(Story) => <div style={{ position:"relative", width:390, height:260, background:"linear-gradient(135deg,#263878,#11103f)" }}><Story /></div>] };
