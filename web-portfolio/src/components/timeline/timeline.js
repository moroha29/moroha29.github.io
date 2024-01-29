import './timeline.css';


export default function Timeline() {
  return (
    <div className="timeline">
        <div className="container1 left">
          <div className="card timeLineCard content1">
              <h3>DiscoverMarket Asia Pte. Ltd</h3>
              <p><i>Full Stack Developer</i></p>
              <p><i>Jan 2024 - May 2024</i></p>
              <div className='hoverContent'>
                <ul>
                  <li>Create a chatbot with the use of Streamlit and OpenAi.</li>
                  <li>Recommend changes in the model that is currently being tested and pushed out.</li>
                </ul>
              </div>
          </div>
        </div>
        <div className="container1 right">
          <div className="card timeLineCard content1">
              <h3>Solderfield Pte. Ltd</h3>
              <p><i>Java Developer</i></p>
              <p><i>May 2023 - Dec 2023</i></p>
              <div className='hoverContent'>
                <ul>
                  <li>Developed Frontend solutions for webapp with the use of Angular.</li>
                  <li>Wrote Unit Testing for products utilizing Jasmine and Karma.</li>
                  <li>Make screens of the product look more beautiful with the use of HTML, CSS and PrimeNG.</li>
                  <li>Bug Fixes for old products with high urgency issues.</li>
                  <li>Documentation writing for all the work I have done to ensure that future developers are able to take over with ease.</li>
                </ul>
              </div>
          </div>
        </div>
    </div>
  );
}

