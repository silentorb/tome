import styled from 'styled-components'

export const GlobalStyle = styled.div`
  font-family: Roboto, HelveticaNeue-Light, Helvetica Neue Light, Helvetica Neue, Helvetica, Arial, Lucida Grande, sans-serif;

  @keyframes Tome__fadeIn {
    from {
      opacity: 0;
    }
    50% {
      opacity: 1;
    }
  }
  @keyframes Tome__fadeOut {
    from {
      opacity: 1;
    }
    50% {
      opacity: 0;
    }
    to {
      opacity: 0;
    }
  }
  .Tome__fade-enter {
    animation-name: Tome__fadeIn;
  }

  .Tome__fade-exit {
    animation-name: Tome__fadeOut;
  }
`
