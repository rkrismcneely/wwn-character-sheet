import { CampaignJournal } from "../../campaign-journal";
import "../../campaign-ui.css";
import "../../campaign-journal.css";
export default async function JournalPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 return <CampaignJournal campaignId={id}/>;
}
