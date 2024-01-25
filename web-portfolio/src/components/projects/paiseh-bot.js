import paisehbotpoll from "../../assets/paiseh-bot-poll.png";
import Tags from "../tags/tag";
import './projects.css'

export default function PaisehBot() {
    return (
      <div className='paisehBot'>
        <h1>Paiseh Bot</h1>
        <i>The Absolutely Useless bot made for fun</i>
        <br></br>
        <h3>Details</h3>
        <p>
            Made for the use of NUS Hack and Roll 2024<br></br>
            Its a currently for fun bot that was made to generate out "embarassing" questions.<br></br>
            Inspired by the telegram group that has been growing called Paiseh Questions, we attempted to create the same thing.<br></br>
            But instead of copying it fully, we added a twist in mainly 3 portions:
        </p>
        <ul>
            <li>Data Analysis</li>
            <li>Machine Learning</li>
            <li>User Self Submission</li>
        </ul>
        <h2>Links</h2>
        <ul>
            <li><a href="https://github.com/moroha29/HackAndRollFE">Github Link (Frontend)</a></li>
            <li><a href="https://github.com/moroha29/HackAndRollBE">Github Link (Backend)</a></li>
            <li><a href="https://devpost.com/software/don-t-paiseh">Devpost Link</a></li>
        </ul>
        <h2>Stack</h2>
        <p>NextJS, FastAPI, MongoDB</p>
        <h2 id='machineLearning'>Machine Learning</h2>
        <p>
          With the recent advancement of AI, I decided to implement the use of it here
          with the help of GPT-3.5 and its fine-tuning AI. 300 of the most recent polls were filtered from the channel, exported into JSONL format and fed into the fine tuning API.
          <br></br><img src={paisehbotpoll} alt="" className="image-middle"></img>
          <p className="image-caption">Example of a poll in the group</p>
          We then used the model to generate out example questions by prompting the bot to come up
          with paiseh questions.
        </p>
        <Tags tagNames={['Python','NextJs','TypeScript','FastAPI','MongoDB']}/>
      </div>
    );
  }
  