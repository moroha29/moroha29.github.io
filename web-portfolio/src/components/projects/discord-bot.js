import Tags from "../tags/tag";

export default function DiscordBot() {
    return (
      <div className='discordBot'>
        <h1>Discord Bot</h1>
        <i>The All in One bot</i>
        <h3>Inspiration</h3>
        <p>
          Started off as a just for fun bot, it is now a bot where i start to test functions
          for experiemental features which I feel can help people or myself in the future
        </p>
        <h2 id='osuBotFeatures'>Osu Bot Features</h2>
        <i>Commands made for OSU!</i>
        <br></br><br></br>
        <h4 id="webScraper">Web Scraper</h4>
        <p>
          This searches the multiplayer link by scraping the html and getting the JSON object, parsing it
          before and checking if the content is what we are searching for if not it will increment or 
          decrement accordingly and check the next link.
        </p>
        <Tags tagNames={['Python','JavaScript']}/>
      </div>
    );
  }
  