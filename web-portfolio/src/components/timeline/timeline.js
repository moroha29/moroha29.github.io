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
                  <li>Created an assistant chatbot with the use of Streamlit and OpenAi.</li>
                  <li>Developed 3 demonstrations for solutions to help price different insurance policies with the use of Machine Learning and Data Science tools 
                    to display data neatly with stellar acknowledgment from project managers on the end products.</li>
                  <li>Identified 2 areas for improvement in current products and recommended solutions to solve them.</li>
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
                  <li>Developed frontend solutions for webapp with the use of Angular.</li>
                  <li>Wrote Unit Testing for products utilizing Jasmine and Karma.</li>
                  <li>Made screens of webapps look visually appealing on both mobile and desktop with the use of HTML, CSS, Bootstrap and PrimeNG.</li>
                  <li>Bug Fixes for pre-existing projects.</li>
                  <li>Created a boilerplate for the frontend framework for the company to increase productivity by 50% for future frontend development.</li>
                  <li>Prepared documentation writing for my projects to facilitate the handover to future developers.</li>
                </ul>
              </div>
          </div>
        </div>
    </div>
  );
}

