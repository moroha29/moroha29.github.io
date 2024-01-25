import './App.css';
import './Projects.css'
import DiscordBot from './components/projects/discord-bot';
import PortfolioWebsite from './components/projects/portfolio-website';
import SideMenu from './components/side-menu/side-menu';
import PaisehBot from './components/projects/paiseh-bot';


export default function Projects() {

  const projects= [
    {
      name: "portfolioWebsite",
      displayName: "Portfolio Website",
      project: PortfolioWebsite,
      sections: [
        {
          displayName:"Dark and Light Mode",
          name: "darkLightMode",
          header: true
        },
        {
          displayName:"Template shifting",
          name: "templateMode",
          header: true
        }
    ],
    },
    {
      name: "discordBot",
      displayName: "Discord Bot",
      project: DiscordBot,
      sections: [
        {
          displayName:"Osu Bot Features",
          name: "osuBotFeatures",
          header: true
        },
        {
          displayName:"Web Scraper",
          name: "webScraper",
          header: false
        }
    ],
    },
    {
      name: "paisehBot",
      displayName: "Dont Paiseh",
      project: PaisehBot,
      sections: [
        {
          displayName:"Machine Learning",
          name: "machineLearning",
          header: true
        },
    ],
    },
  ];

  return (
      <div className='container projects'>
          <SideMenu className="col-2" projects={projects}/>
          <div className='projectContent'>
            {projects.map((item)=>{
              return(
              <div key={item.name} className='row project' id={item.name}>
                <item.project/>
              </div>)
            })}
          </div>
      </div>
  );
}
