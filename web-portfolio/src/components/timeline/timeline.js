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
                <p>TestTestTest</p>
              </div>
          </div>
        </div>
        <div className="container1 right">
          <div className="card timeLineCard content1">
              <h3>Solderfield Pte. Ltd</h3>
              <p><i>Java Developer</i></p>
              <p><i>May 2023 - Dec 2023</i></p>
              <div className='hoverContent'>
                <p>TestTestTest</p>
              </div>
          </div>
        </div>
    </div>
  );
}

