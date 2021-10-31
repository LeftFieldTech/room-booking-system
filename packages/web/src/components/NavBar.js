import React from 'react'
import { withRouter, Link } from 'react-router-dom'
import { signOut } from '../api/auth'

function NavBar({
  loadMyBookings,
  user,
  history
}) {

  return (
    <nav className="nav">
      <ul className="nav__list">
        <li className="nav__item"><Link to="/bookings" className="nav__link">View Room Availability</Link></li>
        <li className="nav__item"><Link to="/mybookings" className="nav__link">My Bookings</Link></li>
        <li className="nav__item"><a onClick={onClickSignout} className="nav__link">Logout</a></li>
      </ul>
    </nav>
  )

  async function onClickSignout() {
    await signOut()
    window.location.href = '/'
  }
}

export default withRouter(NavBar)